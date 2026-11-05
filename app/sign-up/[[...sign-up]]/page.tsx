import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth-frame";

export default function SignUpPage() {
  return (
    <AuthFrame>
      <Suspense>
        <SignUp />
      </Suspense>
    </AuthFrame>
  );
}
