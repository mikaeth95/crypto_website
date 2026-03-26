import { useState, type FormEvent } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Input } from "../ui/input";

const submitButtonClassName =
  "button-primary h-10 w-full justify-center";

export const LoginForm = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await signIn({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
    }

    setIsSubmitting(false);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
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
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          required
        />
      </label>

      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

      <button type="submit" className={submitButtonClassName} disabled={isSubmitting}>
        {isSubmitting ? "Signing In..." : "Login"}
      </button>
    </form>
  );
};
