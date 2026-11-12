import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import {
  appendNotification,
  ensureSeededInbox,
  getNotification,
  markNotificationRead,
} from "./notifications.store";
import type { GabNotification } from "./notifications.types";

export type CreateNotificationInput = {
  id?: string;
  at?: string;
  title?: string;
  verdict: string;
  faits: string;
  bloquants: string;
  next?: string;
  needsBen?: boolean;
  read?: boolean;
};

function inferNeedsBen(bloquants: string, explicit?: boolean): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  const b = bloquants.trim().toLowerCase();
  if (!b || b === "aucun" || b.startsWith("aucun ")) return false;
  return true;
}

@Injectable()
export class NotificationsService {
  list() {
    return ensureSeededInbox();
  }

  async get(id: string) {
    const n = await getNotification(id);
    if (!n) throw new NotFoundException("Notification introuvable");
    return n;
  }

  async create(body: CreateNotificationInput) {
    const verdict = body.verdict?.trim();
    const faits = body.faits?.trim();
    const bloquants = body.bloquants?.trim();
    if (!verdict || !faits || !bloquants) {
      throw new BadRequestException("verdict, faits et bloquants requis");
    }
    const title = (body.title?.trim() || verdict).slice(0, 200);
    const id =
      body.id?.trim() ||
      `gab-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const item: GabNotification = {
      id,
      source: "gab",
      at: body.at?.trim() || new Date().toISOString(),
      title,
      verdict,
      faits,
      bloquants,
      next: body.next?.trim() || undefined,
      read: body.read === true,
      needsBen: inferNeedsBen(bloquants, body.needsBen),
    };
    return appendNotification(item);
  }

  async markRead(id: string) {
    const n = await markNotificationRead(id);
    if (!n) throw new NotFoundException("Notification introuvable");
    return n;
  }
}
