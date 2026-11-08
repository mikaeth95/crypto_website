import { useState, type FormEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Input } from "../ui/input";

const submitButtonClassName =
  "button-primary h-10 w-full justify-center";

/**
 * Mindestlänge des Passworts laut Pflichtenheft. Die Prüfung im Browser ist nur
 * Bedienerführung. Verbindlich ist dieselbe Regel in den Supabase-Auth-
 * Einstellungen (Minimum password length), siehe README.
 */
const MIN_PASSWORD_LENGTH = 8;

export const SignupForm = () => {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error, needsEmailConfirmation } = await signUp({
      displayName,
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    setSuccessMessage(
      needsEmailConfirmation
        ? "Account created. Check your email to confirm the account before logging in."
        : "Account created. Redirecting you into the dashboard.",
    );
    setIsSubmitting(false);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Display Name</span>
        <Input
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Portfolio owner"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Email</span>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Password</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Create a password"
          minLength={MIN_PASSWORD_LENGTH}
          aria-describedby="signup-password-hint"
          required
        />
        <span
          id="signup-password-hint"
          className={
            password.length > 0 && password.length < MIN_PASSWORD_LENGTH
              ? "block text-xs text-amber-300"
              : "block text-xs text-slate-500"
          }
        >
          At least {MIN_PASSWORD_LENGTH} characters
          {password.length > 0 && password.length < MIN_PASSWORD_LENGTH
            ? ` (${password.length}/${MIN_PASSWORD_LENGTH})`
            : ""}
        </span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-200">Confirm Password</span>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Repeat your password"
          required
        />
      </label>

      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
      {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

      <button type="submit" className={submitButtonClassName} disabled={isSubmitting}>
        {isSubmitting ? "Creating Account..." : "Create Account"}
      </button>
    </form>
  );
};
