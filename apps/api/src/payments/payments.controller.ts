import { Body, Controller, Headers, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { BookEventDto } from "../events/dto/book-event.dto";
import { VerifySubscriptionPaymentDto } from "./dto/verify-subscription-payment.dto";
import { PaymentsService } from "./payments.service";

type RawBodyRequest = {
  rawBody?: Buffer;
  body: unknown;
};

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("subscription/initialize")
  initializeSubscription(@CurrentUser() user: AuthUser) {
    return this.paymentsService.initializeSubscription(user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("subscription/verify")
  verifySubscription(@CurrentUser() user: AuthUser, @Body() dto: VerifySubscriptionPaymentDto) {
    return this.paymentsService.verifySubscriptionPayment(user.id, dto.reference);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("events/:eventId/ticket/initialize")
  initializeEventTicket(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string, @Body() dto: BookEventDto) {
    return this.paymentsService.initializeEventTicket(user.id, eventId, dto);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("events/:eventId/checkout/initialize")
  initializeEventTicketCheckout(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string, @Body() dto: BookEventDto) {
    return this.paymentsService.initializeEventTicketCheckout(user.id, eventId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("events/ticket/verify")
  verifyEventTicket(@CurrentUser() user: AuthUser, @Body() dto: VerifySubscriptionPaymentDto) {
    return this.paymentsService.verifyEventTicketPayment(user.id, dto.reference);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("events/checkout/verify")
  verifyEventTicketCheckout(@CurrentUser() user: AuthUser, @Body() dto: VerifySubscriptionPaymentDto) {
    return this.paymentsService.verifyEventTicketCheckoutPayment(user.id, dto.reference);
  }

  @Post("paystack/webhook")
  @HttpCode(200)
  handlePaystackWebhook(
    @Headers("x-paystack-signature") signature: string | undefined,
    @Req() request: RawBodyRequest
  ) {
    return this.paymentsService.handlePaystackWebhook(signature, request.rawBody, request.body);
  }
}
