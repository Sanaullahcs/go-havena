import { ApiError } from "@/lib/api/client";
import axios from "axios";
import { showAccountBlockedAlert } from "@/lib/alert";
import { isAccountBlockError } from "@/lib/auth/account-block";

export async function handleLoginError(err: unknown, setError: (msg: string | null) => void): Promise<void> {
  if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
    setError("Request timed out. Check your connection and try again.");
    return;
  }
  if (err instanceof ApiError) {
    if (err.block && isAccountBlockError(err.code)) {
      await showAccountBlockedAlert(err.message, err.block);
      setError(null);
      return;
    }
    setError(err.message);
    return;
  }
  setError("Unable to connect to server. Please try again.");
}
