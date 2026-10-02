- jne,jnt?
- payment method?
- brevo for otp? $10
-




=====
current state
Sure — here’s a cleaner requirements list you can use for the Nilam Store development.

### 1. Store / Company Configuration
- **Sender Email:** `nilam-store-dev@fluxorastudio.id`
- **No-Reply Email:** `nilam-store-dev@fluxorastudio.id`
- **Support Contact Email:** `nilam-store-dev@fluxorastudio.id`
- **Store Address:** Jl Raya Jalingkos, Area Sawah, Kendalserut, Kec. Slawi, Kabupaten Tegal, Jawa Tengah 52412, Indonesia
- Initial configuration can use **dummy/test data** first.
- Email addresses and store information should be configurable from Admin.

### 2. Payment Methods
- QRIS
- GoPay
- ShopeePay
- Virtual Account (VA) Bank
- Payment methods should be configurable/enabled or disabled from Admin.

### 3. Voucher Management
- Create voucher from Admin Dashboard.
- Edit voucher.
- Activate/deactivate voucher.
- Voucher code length: **4–6 characters**.
- Support custom combinations of **letters and numbers**, e.g. `NILAM20`, `NS20`, `A123B`.
- Discount type/value configurable.
- Default discount: **20%**.
- Default minimum purchase: **Rp200,000**.
- Default maximum discount cap: **Rp30,000**.
- Maximum discount cap must be configurable.
- Default voucher validity: **7 days**.
- Expiry date/duration must be configurable.
- Default usage limit: **1 use per customer**.
- Usage limit per customer must be configurable.
- Admin can configure voucher start/end dates.
- Admin can view voucher usage/redemption.
- System validates minimum spend, expiry, usage limit, and discount cap during checkout.

### 4. Shipping / Biteship
- Integrate **Biteship** for shipping.
- Initial supported couriers:
  - JNE
  - J&T
- Customer can select available JNE/J&T shipping services during checkout.
- Shipping cost calculated based on the selected Biteship service.
- Admin should be able to enable/disable supported courier services.

### 5. Order Cancellation
- Customer can submit a cancellation request.
- Cancellation is **not automatically approved**.
- Request appears in Admin Dashboard.
- Admin manually reviews and verifies the request.
- Admin can **Approve** or **Reject** cancellation.
- Cancellation status should be tracked, for example: `Requested → Under Review → Approved/Rejected → Completed`.

### 6. Refund Management
- Refund requests are handled manually.
- Refund request appears in Admin Dashboard.
- Admin manually verifies eligibility.
- Admin can approve/reject refund.
- Default refund processing period: **3 days**.
- Processing period must be configurable from Admin.
- Admin can record refund amount, reason, notes, payment/reference information, and completion date.
- Refund status should be tracked, for example: `Requested → Under Review → Approved/Rejected → Processing → Refunded`.

### 7. Admin Configuration
Admin should have configuration pages for:
- Store information
- Sender/no-reply/support email
- Payment methods
- Shipping couriers/services
- Voucher management
- Minimum voucher spend
- Voucher discount percentage/value
- Maximum voucher discount
- Voucher expiry duration
- Voucher usage limit/customer
- Cancellation settings
- Refund processing duration
- Refund/cancellation status management

### 8. Suggested Admin Menus
- **Dashboard**
- **Orders**
- **Products**
- **Customers**
- **Vouchers**
- **Payments**
- **Shipping**
- **Refunds**
- **Cancellations**
- **Settings**
- **Support / Contact Configuration**