import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listCalendarItems } from "@/lib/calendar";
import { ForbiddenError } from "@/lib/errors";
import { DeadlineCalendar } from "./deadline-calendar";

export default async function CalendarPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const params = await searchParams;
  if (Array.isArray(params.team)) notFound();
  const teamId = typeof params.team === "string" ? params.team : null;
  const data = await listCalendarItems(session.user.id, teamId).catch((error) => {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  });
  return <DeadlineCalendar initial={data} teamId={teamId} focusedAssignment={typeof params.assignment === "string" ? params.assignment : null} />;
}
