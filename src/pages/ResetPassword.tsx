import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { toast } from "sonner";
import { tr } from "@/lib/tr";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { requestPasswordReset, confirmPasswordReset, isAuthenticated, isLoading: isAuthLoading, isUserDataReady } = useAuth();
  const { openAuthModal } = useAuthModal();

  const token = searchParams.get("token") || "";
  const initialEmail = searchParams.get("email") || "";
  const isConfirmMode = Boolean(token);

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetEmailSent, setIsResetEmailSent] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const title = useMemo(
    () => (isConfirmMode ? tr("Create new password") : tr("Reset password")),
    [isConfirmMode]
  );

  useEffect(() => {
    if (!isConfirmMode && !isAuthLoading && isUserDataReady && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isAuthLoading, isConfirmMode, isUserDataReady, navigate]);

  const handleRequest = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setIsResetEmailSent(false);

    const { error } = await requestPasswordReset(email);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setIsResetEmailSent(true);
    toast.success(tr("Password reset email sent."));
  };

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error(tr("Passwords do not match."));
      return;
    }

    setIsLoading(true);
    const { error } = await confirmPasswordReset(token, password);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setIsComplete(true);
    toast.success(tr("Password changed."));
  };

  return (
    <div className="min-h-screen bg-background px-space-4 py-space-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="mb-space-8 inline-flex items-center gap-space-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />{tr("Back to login")}</button>

        <section className="rounded-radius-lg bg-card p-space-6 text-card-foreground md:p-space-8">
          <div className="mb-space-8">
            <div className="mb-space-4 flex h-12 w-12 items-center justify-center rounded-radius-lg bg-primary text-primary-foreground">
              @
            </div>
            <h1 className="text-3xl font-extrabold">{isComplete ? tr("Password changed") : title}</h1>
            <p className="mt-space-3 text-sm font-medium leading-6 text-muted-foreground">
              {isComplete
                ? tr("Your password is updated. You can sign in with the new password now.")
                : isConfirmMode
                  ? tr("Enter a new password for your EverySub account.")
                  : tr("Enter your email and we will generate a secure reset link for this account.")}
            </p>
          </div>

          {isComplete ? (
            <div className="space-y-space-6">
              <div className="flex items-center gap-space-3 rounded-radius-lg bg-primary/10 p-space-4 text-sm font-semibold text-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" />{tr("Password reset completed.")}</div>
              <Button className="w-full" size="lg" onClick={() => openAuthModal("login")}>{tr("Go to login")}</Button>
            </div>
          ) : isConfirmMode ? (
            <form onSubmit={handleConfirm} className="space-y-space-5">
              <Input
                id="password"
                label={tr("New password")}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
                inputSize="md"
                passwordToggle
              />

              <Input
                id="confirmPassword"
                label={tr("Confirm password")}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                required
                inputSize="md"
                passwordToggle
              />

              <Button type="submit" loading={isLoading} className="w-full" size="lg">{tr("Change password")}</Button>
            </form>
          ) : (
            <form onSubmit={handleRequest} className="space-y-space-5">
              <Input
                id="email"
                label={tr("Email")}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                inputSize="md"
              />

              <Button type="submit" loading={isLoading} className="w-full" size="lg">{tr("Create reset link")}</Button>

              {isResetEmailSent && (
                <div className="flex items-center gap-space-3 rounded-radius-lg bg-primary/10 p-space-4 text-sm font-semibold text-foreground">
                  <CheckCircle2 className="h-5 w-5 text-primary" />{tr("Check your email for the password reset link.")}</div>
              )}
            </form>
          )}
        </section>
      </div>
    </div>
  );
};

export default ResetPassword;
