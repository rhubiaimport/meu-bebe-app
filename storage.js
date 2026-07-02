const MeuBebeStorage = {
  key: "meu-bebe:v1",
  backupPrefix: "meu-bebe:backup:",
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(data) {
    const current = localStorage.getItem(this.key);
    if (current) {
      try {
        localStorage.setItem(`${this.backupPrefix}${new Date().toISOString()}`, JSON.stringify({
          createdAt: new Date().toISOString(),
          reason: "storage-save",
          raw: current
        }));
      } catch {}
    }
    localStorage.setItem(this.key, JSON.stringify(data));
  }
};
