import { Redirect } from "wouter";

/**
 * Home Page - Redirects to Admin Dashboard
 */
export default function Home() {
  return <Redirect to="/admin" />;
}
