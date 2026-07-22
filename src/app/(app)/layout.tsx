import { TabBar } from "@/components/TabBar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <TabBar />
      <div className="flex grow flex-col px-4 py-4">{children}</div>
    </div>
  );
}
