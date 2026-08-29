export class EverymanError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "EverymanError";
  }
}
