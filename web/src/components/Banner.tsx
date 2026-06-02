interface Props {
  kind: "warn" | "error" | "info";
  children: React.ReactNode;
}

export function Banner({ kind, children }: Props) {
  return <div className={`banner ${kind}`}>{children}</div>;
}
