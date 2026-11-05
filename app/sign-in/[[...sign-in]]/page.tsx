import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";

export default function SignInPage() {
  return (
    <AuthFrame>
      <Suspense>
        <SignIn />
      </Suspense>
    </AuthFrame>
  );
}
