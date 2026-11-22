import Image from "next/image";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="login-wrap">
      <div className="auth-card">
        <div className="auth-head">
          <Image src="/icon.svg" alt="" width={56} height={56} priority />
          <h1>My Reading Room</h1>
        </div>
        {children}
      </div>
    </main>
  );
}
