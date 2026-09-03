import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";

export default async function AdminIndexPage() {
  redirect((await isAuthenticated()) ? "/admin/media" : "/admin/login");
}
