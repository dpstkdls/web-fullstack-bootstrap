"use client";

import { Button } from "@repo/ui/components/button";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      {label}
    </Button>
  );
}
