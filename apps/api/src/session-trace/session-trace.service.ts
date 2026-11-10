import { BadRequestException, Injectable } from "@nestjs/common";
import { appendTenantTrace, readTenantTrace } from "./session-trace.store";
import {
  isSessionTraceMessage,
  type SessionTraceMessage,
} from "./session-trace.types";

@Injectable()
export class SessionTraceService {
  list(tenantId: string) {
    return readTenantTrace(tenantId);
  }

  async append(tenantId: string, body: unknown) {
    if (!isSessionTraceMessage(body)) {
      throw new BadRequestException("Message journal invalide");
    }
    const msg: SessionTraceMessage = {
      id: body.id.trim(),
      role: body.role,
      text: body.text.trim(),
      at: body.at.trim() || new Date().toISOString(),
      details: body.details ?? {},
    };
    if (!msg.id || !msg.text) {
      throw new BadRequestException("id et text requis");
    }
    return appendTenantTrace(tenantId, msg);
  }
}
