import { redirect } from 'next/navigation';

// Zytrex AI is no longer a page — it's the command bar, everywhere.
export default function AiRedirect() {
  redirect('/dashboard');
}
