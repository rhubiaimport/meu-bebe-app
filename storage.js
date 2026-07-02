const MeuBebeStorage = {
  key: "meu-bebe:v1",
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key));
    } catch {
      return null;
    }
  },
  save(data) {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
};
