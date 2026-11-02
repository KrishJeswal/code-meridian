import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
