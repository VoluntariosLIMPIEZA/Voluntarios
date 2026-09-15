(() => {
  const STORAGE_VOLUNTARIOS = 'limpieza_voluntarios';
  const STORAGE_CONFIG = 'limpieza_config';
  const STORAGE_PLANILLAS = 'limpieza_planillas';
  const STORAGE_CREDENTIALS = 'limpieza_supabase_credentials';
  const STORAGE_MIGRATED = 'limpieza_migrated_to_supabase';
  const DEFAULT_CONFIG = { Martes: 3, Miércoles: 3, Jueves: 3, Viernes: 3, Sábado: 3 };

  function showAppToast(message) {
    if (typeof window.showPwaToast === 'function') {
      window.showPwaToast(message);
      return;
    }
    console.warn(message);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isPlaceholder(value) {
    if (!value) return true;
    return /TU-PROYECTO|TU-ANON-KEY|YOUR_|CHANGEME/i.test(value);
  }

  const db = {
    client: null,
    usingCloud: false,
    skipRealtime: false,

    getCredentials() {
      const saved = readJson(STORAGE_CREDENTIALS, null);
      const url = (saved && saved.url) || window.SUPABASE_URL || '';
      const key = (saved && saved.key) || window.SUPABASE_ANON_KEY || '';
      return { url: String(url).trim(), key: String(key).trim() };
    },

    saveCredentials(url, key) {
      writeJson(STORAGE_CREDENTIALS, { url: url.trim(), key: key.trim() });
    },

    clearSavedCredentials() {
      localStorage.removeItem(STORAGE_CREDENTIALS);
    },

    isConfigured() {
      const { url, key } = this.getCredentials();
      return Boolean(url && key && url.startsWith('https://') && !isPlaceholder(url) && !isPlaceholder(key) && key.length > 20);
    },

    cacheAll(voluntarios, configDias, planillas) {
      writeJson(STORAGE_VOLUNTARIOS, voluntarios);
      writeJson(STORAGE_CONFIG, configDias);
      writeJson(STORAGE_PLANILLAS, planillas);
    },

    readCache() {
      return {
        voluntarios: ensureIds(readJson(STORAGE_VOLUNTARIOS, [])),
        configDias: { ...DEFAULT_CONFIG, ...(readJson(STORAGE_CONFIG, {}) || {}) },
        planillas: readJson(STORAGE_PLANILLAS, [])
      };
    },

    async init() {
      if (this.usingCloud && this.client) return true;
      this.client = null;
      this.usingCloud = false;
      if (!this.isConfigured()) return false;
      if (typeof supabase === 'undefined' || !supabase.createClient) {
        throw new Error('No se pudo cargar la librería de Supabase.');
      }
      const { url, key } = this.getCredentials();
      this.client = supabase.createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { error } = await this.client.from('configuracion').select('id').limit(1);
      if (error) {
        this.client = null;
        throw new Error(error.message);
      }
      this.usingCloud = true;
      this.subscribeRealtime();
      return true;
    },

    subscribeRealtime() {
      if (!this.client) return;
      this.client.removeAllChannels();
      this.client
        .channel('voluntarios-app')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'voluntarios' }, () => this.emitRemoteChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion' }, () => this.emitRemoteChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planillas' }, () => this.emitRemoteChange())
        .subscribe();
    },

    emitRemoteChange() {
      if (this.skipRealtime) return;
      window.dispatchEvent(new CustomEvent('voluntarios:remote-change'));
    },

    async withQuietRealtime(fn) {
      this.skipRealtime = true;
      try {
        return await fn();
      } finally {
        setTimeout(() => { this.skipRealtime = false; }, 800);
      }
    },

    mapVoluntarioFromRow(row) {
      return {
        id: row.id,
        nombre: row.nombre,
        dias: row.dias || [],
        esCapitan: !!row.es_capitan,
        diasCapitan: row.dias_capitan || []
      };
    },

    mapVoluntarioToRow(v) {
      return {
        id: v.id,
        nombre: v.nombre,
        dias: v.dias || [],
        es_capitan: !!v.esCapitan,
        dias_capitan: v.diasCapitan || [],
        updated_at: new Date().toISOString()
      };
    },

    mapPlanillaFromRow(row) {
      return {
        id: row.id,
        periodo: row.periodo,
        etiqueta: row.etiqueta,
        fechaInicio: row.fecha_inicio,
        fechaFin: row.fecha_fin,
        asignaciones: row.asignaciones || {},
        configUsada: row.config_usada || {},
        creada: row.creada
      };
    },

    mapPlanillaToRow(p) {
      return {
        id: p.id,
        periodo: p.periodo,
        etiqueta: p.etiqueta,
        fecha_inicio: p.fechaInicio,
        fecha_fin: p.fechaFin,
        asignaciones: p.asignaciones || {},
        config_usada: p.configUsada || {},
        creada: p.creada || new Date().toISOString()
      };
    },

    async loadAll() {
      if (!this.usingCloud || !this.client) {
        return this.readCache();
      }

      const [volRes, cfgRes, plaRes] = await Promise.all([
        this.client.from('voluntarios').select('*').order('created_at', { ascending: true }),
        this.client.from('configuracion').select('*').eq('id', 'default').maybeSingle(),
        this.client.from('planillas').select('*').order('creada', { ascending: true })
      ]);

      if (volRes.error) throw new Error(volRes.error.message);
      if (cfgRes.error) throw new Error(cfgRes.error.message);
      if (plaRes.error) throw new Error(plaRes.error.message);

      let voluntarios = (volRes.data || []).map((row) => this.mapVoluntarioFromRow(row));
      let configDias = { ...DEFAULT_CONFIG, ...((cfgRes.data && cfgRes.data.dias) || {}) };
      let planillas = (plaRes.data || []).map((row) => this.mapPlanillaFromRow(row));

      const cache = this.readCache();
      const alreadyMigrated = localStorage.getItem(STORAGE_MIGRATED) === '1';
      if (!alreadyMigrated && !voluntarios.length && !planillas.length && cache.voluntarios.length) {
        voluntarios = ensureIds(cache.voluntarios);
        configDias = cache.configDias;
        planillas = cache.planillas.map((p) => ({
          ...p,
          id: isUuid(p.id) ? p.id : crypto.randomUUID()
        }));
        await this.saveVoluntarios(voluntarios);
        await this.saveConfig(configDias);
        await this.savePlanillas(planillas);
        localStorage.setItem(STORAGE_MIGRATED, '1');
        showAppToast('Se copiaron los datos locales a Supabase.');
      }

      this.cacheAll(voluntarios, configDias, planillas);
      return { voluntarios, configDias, planillas };
    },

    async saveVoluntarios(list) {
      const voluntarios = ensureIds(list);
      writeJson(STORAGE_VOLUNTARIOS, voluntarios);
      if (!this.usingCloud || !this.client) return voluntarios;

      await this.withQuietRealtime(async () => {
        const { data: existing, error: readError } = await this.client.from('voluntarios').select('id');
        if (readError) throw new Error(readError.message);
        const keep = new Set(voluntarios.map((v) => v.id));
        const toDelete = (existing || []).map((row) => row.id).filter((id) => !keep.has(id));
        if (toDelete.length) {
          const { error } = await this.client.from('voluntarios').delete().in('id', toDelete);
          if (error) throw new Error(error.message);
        }
        if (voluntarios.length) {
          const { error } = await this.client.from('voluntarios').upsert(voluntarios.map((v) => this.mapVoluntarioToRow(v)));
          if (error) throw new Error(error.message);
        }
      });
      return voluntarios;
    },

    async saveConfig(configDias) {
      writeJson(STORAGE_CONFIG, configDias);
      if (!this.usingCloud || !this.client) return;
      await this.withQuietRealtime(async () => {
        const { error } = await this.client.from('configuracion').upsert({
          id: 'default',
          dias: configDias,
          updated_at: new Date().toISOString()
        });
        if (error) throw new Error(error.message);
      });
    },

    async savePlanillas(list) {
      const planillas = list.map((p) => ({
        ...p,
        id: isUuid(p.id) ? p.id : crypto.randomUUID()
      }));
      writeJson(STORAGE_PLANILLAS, planillas);
      if (!this.usingCloud || !this.client) return planillas;

      await this.withQuietRealtime(async () => {
        const { data: existing, error: readError } = await this.client.from('planillas').select('id,periodo');
        if (readError) throw new Error(readError.message);
        const keepPeriodos = new Set(planillas.map((p) => p.periodo));
        const toDelete = (existing || []).filter((row) => !keepPeriodos.has(row.periodo)).map((row) => row.id);
        if (toDelete.length) {
          const { error } = await this.client.from('planillas').delete().in('id', toDelete);
          if (error) throw new Error(error.message);
        }
        if (planillas.length) {
          const { error } = await this.client.from('planillas').upsert(planillas.map((p) => this.mapPlanillaToRow(p)), { onConflict: 'periodo' });
          if (error) throw new Error(error.message);
        }
      });
      return planillas;
    }
  };

  function isUuid(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function ensureIds(list) {
    return (list || []).map((v) => ({
      ...v,
      id: isUuid(v.id) ? v.id : crypto.randomUUID()
    }));
  }

  window.VoluntariosDB = db;
})();
