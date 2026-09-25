import { NextResponse } from "next/server";

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "Authentication required") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Not allowed") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function gone(message: string) {
  return NextResponse.json({ error: message }, { status: 410 });
}

export function conflict(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function tooManyRequests(message = "Too many attempts, try again later") {
  return NextResponse.json({ error: message }, { status: 429 });
}

export function internalError(message = "Internal error") {
  return NextResponse.json({ error: message }, { status: 500 });
}
