import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../auth/auth.types";
import { TicketsService } from "../tickets/tickets.service";
import { requirePcConfirmedAt } from "./pc-confirm";
import { SupportTrackingService } from "./support-tracking.service";

class SoftTicketDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class SupportHandoffDto {
  /** Pages soft twin */
  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SoftTicketDto)
  ticket?: SoftTicketDto;

  /** Authenticated Atlas client (Pragma) */
  @IsOptional()
  @IsString()
  @MinLength(20)
  reportMarkdown?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fingerprints?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shortIds?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  missionId?: string;

  /**
   * C1 local confirm (ISO). Required for Bearer handoff.
   * Phone→PC path needs ATLAS_API_BASE — not invented here.
   */
  @IsOptional()
  @IsString()
  pcConfirmedAt?: string;

  /** Client hint only — never grants handoff. Fail-closed if phone. */
  @IsOptional()
  @IsString()
  initiatedFrom?: string;
}

class SupportVulnItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  risk?: string;

  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  fingerprint?: string;
}

class SupportVulnIngestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportVulnItemDto)
  vulns!: SupportVulnItemDto[];

  @IsOptional()
  @IsString()
  source?: string;
}

function sessionIdFrom(
  header?: string,
  alt?: string,
): string {
  return (header || alt || "").trim();
}

/**
 * Thin support-tracking API — opaque session after prise en charge.
 * POST /v1/support/handoff : soft twin (pages, no auth) OR Bearer → Pragma ticket.
 * GET  /v1/support/{tickets|vulns|progress} : X-Atlas-Support-Session
 * POST /v1/support/vulns : scanner opt-in ingest
 *
 * Thin slice (D5 missing): PC-initiated C1 only. Phone soft twin refused.
 */
@Controller("support")
export class SupportTrackingController {
  constructor(
    @Inject(SupportTrackingService)
    private readonly tracking: SupportTrackingService,
    @Inject(TicketsService) private readonly tickets: TicketsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  @Post("handoff")
  async handoff(
    @Body() body: SupportHandoffDto,
    @Req() req: { headers: { authorization?: string }; user?: AuthUser },
  ) {
    const initiated = (body.initiatedFrom ?? "").trim().toLowerCase();
    /* Fail-closed: no invent phone→PC without ATLAS_API_BASE */
    if (initiated === "phone" || initiated === "mobile") {
      throw new BadRequestException(
        "Handoff téléphone refusé tant que le pont PC (ATLAS_API_BASE) n’est pas branché. Ouvrez Atlas sur le PC local.",
      );
    }

    const user = await this.optionalUser(req.headers.authorization);
    if (user) {
      this.auth.requireTenant(user, ["owner", "operator"]);
      requirePcConfirmedAt(body.pcConfirmedAt);
      if (!body.reportMarkdown || body.reportMarkdown.trim().length < 20) {
        throw new BadRequestException(
          "Rapport Markdown requis pour la prise en charge authentifiée",
        );
      }
      const result = await this.tickets.requestPragmaHandoff(user, {
        reportMarkdown: body.reportMarkdown,
        fingerprints: body.fingerprints,
        shortIds: body.shortIds,
        subject: body.subject,
        missionId: body.missionId,
      });
      const snap = await this.tracking.attachAuthenticatedHandoff({
        ticketId: result.ticketId,
        tenantId: user.tenantId!,
        subject: body.subject,
        shortIds: body.shortIds,
        fingerprints: body.fingerprints,
        source: "atlas-client",
      });
      return {
        ...result,
        ...snap,
        id: result.ticketId,
      };
    }

    /*
     * Pages soft twin (hors monorepo) — follow-up C1 on atlas-secu-pages.
     * Phone already refused above. Do not require pcConfirmedAt here yet
     * (would break live Pages until that repo ships C1).
     */
    const snap = await this.tracking.createSoftHandoff({
      source: body.source || "atlas-secu-pages",
      ticket: body.ticket,
    });
    return {
      ...snap,
      ticketId: snap.ticketId ?? snap.tickets[0]?.id,
      id: snap.ticketId ?? snap.tickets[0]?.id,
      notice:
        "Session support opaque créée (soft twin). Aucune donnée personnelle stockée.",
    };
  }

  @Get("tickets")
  listTickets(
    @Headers("x-atlas-support-session") sid?: string,
    @Headers("X-Atlas-Support-Session") sidAlt?: string,
  ) {
    return this.tracking.listTickets(sessionIdFrom(sid, sidAlt));
  }

  @Get("vulns")
  listVulns(
    @Headers("x-atlas-support-session") sid?: string,
    @Headers("X-Atlas-Support-Session") sidAlt?: string,
  ) {
    return this.tracking.listVulns(sessionIdFrom(sid, sidAlt));
  }

  @Get("progress")
  listProgress(
    @Headers("x-atlas-support-session") sid?: string,
    @Headers("X-Atlas-Support-Session") sidAlt?: string,
  ) {
    return this.tracking.listProgress(sessionIdFrom(sid, sidAlt));
  }

  @Post("vulns")
  ingestVulns(
    @Body() body: SupportVulnIngestDto,
    @Headers("x-atlas-support-session") sid?: string,
    @Headers("X-Atlas-Support-Session") sidAlt?: string,
  ) {
    return this.tracking.ingestVulns(
      sessionIdFrom(sid, sidAlt),
      body.vulns ?? [],
    );
  }

  private async optionalUser(
    authorization?: string,
  ): Promise<AuthUser | null> {
    if (!authorization?.startsWith("Bearer ")) return null;
    try {
      const payload = await this.jwt.verifyAsync(authorization.slice(7));
      return await this.auth.userFromPayload(payload);
    } catch {
      throw new UnauthorizedException("Token invalide");
    }
  }
}
