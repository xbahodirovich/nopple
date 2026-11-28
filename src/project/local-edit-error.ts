/** The local interpreter understood the request shape but cannot perform it. */
export class LocalEditUnsupported extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LocalEditUnsupported';
  }
}
