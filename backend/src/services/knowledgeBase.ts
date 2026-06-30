/**
 * Static "domain knowledge" for the fictional store this agent supports.
 * For this exercise it's hardcoded and injected into the system prompt.
 * In a real Spur deployment this would live in the DB (a `knowledge_base`
 * table per-merchant) and get fetched + cached (Redis) before each call —
 * swapping that in later only means changing `getStoreKnowledge()`.
 */
export function getStoreKnowledge(): string {
  return `
Store name: Northwind Goods (a small e-commerce store selling home & lifestyle products).

Shipping policy:
- We ship within India only, via Delhivery and Bluedart.
- Standard shipping takes 4-6 business days. Express shipping (extra cost) takes 1-2 business days.
- Orders above ₹999 ship free. Orders below that have a flat ₹79 shipping fee.
- We do not currently ship internationally (no shipping to USA, UK, etc.).

Returns & refunds policy:
- Items can be returned within 14 days of delivery, unused and in original packaging.
- To start a return, the customer should email support@northwindgoods.example with their order number.
- Refunds are issued to the original payment method within 5-7 business days after we receive the returned item.
- Sale/clearance items are final sale and cannot be returned.
- Damaged or incorrect items can be replaced or refunded at no extra cost — ask the customer to share a photo.

Support hours:
- Monday to Saturday, 9:00 AM to 7:00 PM IST.
- Closed on Sundays and public holidays.
- Email: support@northwindgoods.example
- Average response time: within 24 hours on business days.

Payments:
- We accept UPI, credit/debit cards, and net banking via Razorpay.
- Cash on delivery is available for orders under ₹2000.

Order tracking:
- Tracking links are emailed once an order ships, usually within 1 business day of placing the order.
`.trim();
}
