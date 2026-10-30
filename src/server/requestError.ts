/** Expected failures that may cross a transaction without becoming a DB error. */
export class RequestError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
