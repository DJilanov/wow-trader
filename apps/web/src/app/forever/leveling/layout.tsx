import { LevelingProvider } from "../../../components/leveling-provider";

export default function LevelingLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <LevelingProvider>{children}</LevelingProvider>;
}
