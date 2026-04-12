import { POST as createPaymentOrder } from "@/app/api/payments/orders/route";

export const runtime = "nodejs";

export const POST = createPaymentOrder;
