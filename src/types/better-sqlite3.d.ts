declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string, options?: any);
    exec(sql: string): void;
    prepare(sql: string): any;
    transaction(fn: any): any;
    pragma(sql: string): any;
    close(): void;
  }
  export default Database;
}