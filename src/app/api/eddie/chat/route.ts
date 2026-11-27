import { eddieGet, eddiePost } from "@/lib/eddie-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = () => eddieGet();
export const POST = (request: Request) => eddiePost(request);
