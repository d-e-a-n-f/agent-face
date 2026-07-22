import type { CSSProperties } from "react";

/**
 * Deliberately dependency-free inline styles. The panel must render sensibly
 * inside any host application without pulling in a styling system.
 */
export const styles = {
  panel: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    color: "#1a1a2e",
    background: "#fafafa",
    border: "1px solid #d0d0da",
    borderRadius: 8,
    margin: 8,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "6px 10px",
    background: "#eceaf6",
    borderBottom: "1px solid #d0d0da",
  },
  headerTitle: { fontWeight: 700 },
  toggle: {
    border: "1px solid #b5b2c9",
    borderRadius: 4,
    background: "#fff",
    padding: "2px 8px",
    cursor: "pointer",
    font: "inherit",
  },
  body: { display: "flex", gap: 12, padding: 10, alignItems: "flex-start" },
  column: { flex: 1, minWidth: 0 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 10,
    color: "#5b5878",
    margin: "0 0 6px",
  },
  treeNode: {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "1px solid transparent",
    borderRadius: 4,
    background: "none",
    padding: "3px 6px",
    cursor: "pointer",
    font: "inherit",
  },
  treeNodeSelected: {
    background: "#e3defc",
    borderColor: "#b5a8f5",
  },
  card: {
    border: "1px solid #e0dfe8",
    borderRadius: 6,
    background: "#fff",
    padding: 8,
    marginBottom: 8,
  },
  cardTitle: { fontWeight: 700 },
  muted: { color: "#807d99" },
  badge: {
    display: "inline-block",
    borderRadius: 4,
    padding: "0 6px",
    marginLeft: 6,
    fontSize: 10,
    border: "1px solid",
  },
  badgeOk: { color: "#1d6b3c", borderColor: "#8fd0a8", background: "#e9f8ef" },
  badgeWarn: { color: "#8a5a00", borderColor: "#ecc46f", background: "#fdf4dd" },
  badgeErr: { color: "#a11d33", borderColor: "#eda3b0", background: "#fdecef" },
  pre: {
    margin: "6px 0 0",
    padding: 6,
    background: "#f4f3f8",
    borderRadius: 4,
    overflowX: "auto",
    maxHeight: 160,
    whiteSpace: "pre-wrap",
  },
  button: {
    border: "1px solid #7b6ff0",
    borderRadius: 4,
    background: "#7b6ff0",
    color: "#fff",
    padding: "3px 10px",
    cursor: "pointer",
    font: "inherit",
    marginRight: 6,
  },
  buttonSecondary: {
    border: "1px solid #b5b2c9",
    borderRadius: 4,
    background: "#fff",
    color: "#1a1a2e",
    padding: "3px 10px",
    cursor: "pointer",
    font: "inherit",
    marginRight: 6,
  },
  buttonDisabled: { opacity: 0.45, cursor: "not-allowed" },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 60,
    font: "inherit",
    border: "1px solid #d0d0da",
    borderRadius: 4,
    padding: 6,
  },
  select: {
    font: "inherit",
    border: "1px solid #d0d0da",
    borderRadius: 4,
    padding: "3px 6px",
    marginBottom: 6,
    maxWidth: "100%",
  },
  input: {
    font: "inherit",
    border: "1px solid #d0d0da",
    borderRadius: 4,
    padding: "3px 6px",
    marginBottom: 6,
    width: "100%",
    boxSizing: "border-box",
  },
  traceRow: {
    borderBottom: "1px solid #ecebf2",
    padding: "3px 0",
    display: "flex",
    gap: 8,
    alignItems: "baseline",
  },
  traceList: { maxHeight: 220, overflowY: "auto" },
} satisfies Record<string, CSSProperties>;

/** Merges style objects, later entries winning. */
export function mergeStyles(
  ...entries: readonly (CSSProperties | false | undefined)[]
): CSSProperties {
  return Object.assign({}, ...entries.filter(Boolean)) as CSSProperties;
}
