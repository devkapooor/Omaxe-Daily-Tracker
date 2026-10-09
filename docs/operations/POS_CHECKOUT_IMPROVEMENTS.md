# POS checkout implementation plan

Status (2026-10-10): The checkout layout, payment interactions, unified barcode/name search, and unresolved-item billing guard are implemented in `src/features/pos/components/PosPage.tsx`, `CheckoutPaymentPanel.tsx`, and `src/features/pos/domain/checkoutPayments.ts`. The [Version Log](VERSION_LOG.md) records the related production deployment and verification. No additional production check is implied by this documentation update.

## Requested behavior

1. Replace the manual product lookup card with the items in the current cart, directly below the barcode scanner on the left.
2. Keep customer details, discounts, totals and payment controls on the right. Stack cart before payment on smaller screens.
3. Remove the Products tab and its product-editing screen.
4. Select Cash, UPI, Card or Bank Transfer to allocate the entire bill automatically. Show editable payment allocation fields only in the Split payments popup.
5. For cash, enter the total cash received from the customer and calculate change automatically. For a split payment, calculate change against its cash portion.

## Implementation

- Move the existing cart controls into the left panel, preserving scanning, quantity changes, item removal, negative-stock warnings and held carts.
- Remove the manual lookup controls and Products panel from the POS component.
- Add a dedicated payment component with method selection and a native modal split-payment dialog. Escape/Cancel preserves the previously selected payment method.
- Add payment calculation helpers that generate full-total allocations, validate split totals, reject negative amounts and cash underpayments, and calculate change in integer paise.
- Follow cart and discount totals automatically for a single method. If a previously entered split stops matching the total, block finalization until corrected.
- Preserve the existing bill, receipt, stock movement and approval data formats.

## Verification and release

- Unit checks cover each full-payment method, cash change, cash underpayment, split cash change, invalid/stale splits, and switching from cash to electronic payment.
- Browser checks cover left/right placement, removal of lookup and Products, quantity-driven totals, payment selection, split popup, cancellation, change calculation, underpayment blocking and mobile layout.
- Browser trials use unsaved cart items while the live sandbox reset is running; no stock import, reset, finalized bill or stock mutation is part of this UI change.
- Build an isolated committed release with local credentials excluded, then deploy Firebase Hosting and verify the public URL.
