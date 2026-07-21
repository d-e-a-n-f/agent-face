/**
 * Bundlers statically replace `process.env.NODE_ENV` in browser builds; this
 * declaration keeps the package free of a Node types dependency.
 */
declare const process: {
  readonly env: {
    readonly NODE_ENV?: string;
  };
};
