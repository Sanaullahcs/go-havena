# Operations Manual

**Opus Galaxy Apartments**  
Community administration guide for Havena

| Field | Detail |
|---|---|
| Document owner | Havena |
| Audience | Society management, Opus Galaxy Apartments |
| Location | Lahore, Punjab, Pakistan |
| Version | 1.0 |
| Effective date | 9 September 2026 |
| Classification | For client use — not for public circulation |
| Support | hello@gohavena.com |

Pakistan communities are billing-exempt. Opus Galaxy Apartments is not required to add a payment card or complete Stripe checkout.

This document is for community administrators and office staff. Residents require only **Section 4**.

---

## Contents

1. Purpose and access  
2. Getting started  
3. Administration reference  
4. Resident onboarding  
5. Operating standards  
6. Organisation of the platform  
7. Support and exception handling  
8. Account provisioning checklist  

### Access points

| Role | Channel | Address |
|---|---|---|
| Community administrator | Web portal | https://gohavena.com/login |
| Resident | Web portal | https://gohavena.com/resident-login |
| Resident | Mobile application | Provided by Havena on request |
| Support | Email | hello@gohavena.com |

---

## 1. Purpose and access

Havena is the operational system for Opus Galaxy Apartments. Management uses it to communicate with residents, issue notices and alerts, manage membership, control guest access, and maintain rules, documents, and amenity bookings.

The platform is organised as follows:

1. **Lahore** is the city (location).
2. **Opus Galaxy Apartments** is the society (community).
3. The office account is the **community administrator**.
4. Households are **residents** of this society only.

Other societies in Lahore may be added to Havena independently. Their residents, notices, and records remain separate from Opus Galaxy Apartments.

**Billing.** Communities in Pakistan do not require a credit card, Stripe subscription, or bank connection (Plaid). Those menus may be ignored.

---

## 2. Getting started

### 2.1 Prerequisites

Before first login, the administrator should have:

- The work email address registered as the Havena login
- Access to that inbox (one-time passcodes are sent there)
- A current mobile number
- An initial resident list: full name, email, unit, and telephone

A payment card is not required.

### 2.2 Sign in

1. Open a current browser (Chrome or Microsoft Edge recommended).
2. Go to **https://gohavena.com/login**. This address is for administrators only. Residents must use the resident portal.
3. Enter the registered email address and request a one-time passcode (OTP).
4. Open the Havena message in email, copy the OTP, and enter it on the website.

If the message is not in the inbox, check Spam or Junk. Passcodes expire; request a new code if authentication fails. Bookmark the administrator login for subsequent use.

If Havena provisioned the account, the administrator proceeds to the profile form and then the dashboard. Self-registered accounts may remain pending until Havena approves the society. No payment is required in either case.

### 2.3 Complete the administrator profile

Complete the profile accurately. The display name appears on notices issued to residents.

1. **Full name** — the administrator’s professional name.
2. **Telephone** — select Pakistan (+92) and enter the mobile number.
3. **Unit / office** — enter *Office* or *Management*.
4. A short biography is optional.

Save the form. A utility-bill upload is not required when Havena has already approved the account. Successful completion opens the **Dashboard**.

### 2.4 Invite the first residents

Invite residents before publishing content. An initial group of approximately ten occupied units is sufficient to begin operations.

1. Open **Members**.
2. Select **Invite**.
3. Enter full name, email (used for login), telephone, and unit number (for example, A-12).
4. Send the invitation.
5. Record the invite code and QR image displayed on screen.
6. Send the code or QR to the resident through the office’s usual channel.

**Suggested resident message**

> Dear Resident,  
> Opus Galaxy Apartments now uses Havena for official notices, events, and guest registration.  
>  
> 1. Open https://gohavena.com/resident-login  
> 2. Sign in with your email: [resident email]  
> 3. Enter the one-time code sent to that inbox  
> 4. Enter this invite code: [CODE]  
> 5. Complete your name and unit number  
>  
> For assistance, contact the management office.

Invite office staff or a floor representative first so they can assist other residents.

### 2.5 Publish the first notice

1. Open **Notices** and create a new notice.
2. Use a clear title, for example: *Welcome to Havena at Opus Galaxy Apartments*.
3. State that this is the official notice board, how service updates will be issued, and how residents should contact the office.
4. Publish the notice.

Keep notices brief. Residents respond to concise, actionable messages.

### 2.6 Establish core society records

| Task | Menu | Purpose |
|---|---|---|
| Record 5–10 standing house rules | Community Rules | Residents can consult policy without requesting a paper copy |
| Upload bylaws, SOPs, and circulars | Documents | Controlled distribution of official files |
| Register bookable facilities | Amenities | Residents reserve the hall, gym, or lawn in the system |
| Review reservation requests | Booking Request | Management retains approval of facility use |

---

## 3. Administration reference

### 3.1 Primary functions

**Dashboard.** Review at the start of each working day. Pending memberships, guests, and bookings are surfaced here.

**Members.** The official resident register. Invite new residents, approve pending requests, and keep unit numbers accurate. Invite only persons who reside or work at Opus Galaxy Apartments.

**Notices.** Routine operational communication. Each notice should state what is happening, when, and what residents should do.

**Events.** Dated activities such as the annual general meeting or festival gatherings.

**Alerts.** Reserved for urgent conditions (fire, gas leak, abrupt water failure, security incident). Do not use Alerts for routine meetings.

**Messages.** Private correspondence with an individual resident.

**Guest Users.** Visitor registrations. Approve known guests and decline unrecognised requests. This is a security control.

**Community Rules.** Standing regulations in plain language.

**Documents.** Official files. Use descriptive names, not scanner defaults.

**Amenities.** Facilities available for reservation, with opening hours and usage limits.

**Booking Request.** Approve available, permitted reservations. Decline conflicts and notify the resident.

**Feed Moderation.** Remove abusive, spam, or misplaced commercial posts. Apply decisions consistently.

**Marketplace and Businesses.** Optional. Not required in the first week.

### 3.2 Functions not required in Pakistan

| Menu | Guidance |
|---|---|
| Billing | Not applicable. Pakistan societies are billing-exempt. |
| Plaid | United States bank-linking service. Do not use. |
| Refer & Earn | Optional. Not required to operate the society. |

If Billing appears empty or incomplete, close the page. That state is expected.

---

## 4. Resident onboarding

This section may be circulated to residents. Residents must not use the administrator login.

### 4.1 Website

1. Open **https://gohavena.com/resident-login**.
2. Enter the email address used by the office in the invitation.
3. Enter the OTP sent to that inbox.
4. Enter the invite code supplied by the office, or scan the QR code.
5. Complete full name and unit number.
6. The Home view then displays notices, events, and the society feed.

### 4.2 Mobile application

The sequence is the same: email, OTP, invite code, profile. The website is sufficient if the application has not yet been installed.

### 4.3 Common issues

| Resident report | Office action |
|---|---|
| No passcode received | Ask the resident to check Spam. Resend the invitation if required. |
| Invite code rejected | Confirm the full code. Codes may expire; issue a new invitation. |
| Wrong email used | The resident must use the invited address. Invite the correct email. |
| Opened the manager page | Direct them to resident-login, not /login. |
| Resident of another building | Do not add them to Opus Galaxy Apartments. |

---

## 5. Operating standards

### 5.1 First week

**Day 1.** Sign in, complete the profile, invite ten residents, and publish the welcome notice.  
**Day 2.** Enter community rules and upload essential documents.  
**Day 3.** Register managed facilities and notify residents.  
**Days 4–5.** Invite remaining occupied units by floor. Correct unit numbers first.  
**End of week.** Issue one operational notice. Clear pending members and bookings.

### 5.2 Ongoing cadence

| Frequency | Action |
|---|---|
| Each morning | Review the Dashboard. Process guest and booking requests. |
| When conditions change | Publish a Notice the same day. |
| Urgent safety matter | Issue an Alert. |
| Scheduled gathering | Create an Event. |
| Weekly | Review Feed Moderation. |
| Monthly | Update Documents when policy changes. |

### 5.3 Notice writing

- One subject per notice
- Opening line: the information
- Second line: date and time
- Third line: the required resident action
- Urdu may be used in the body if that is the office standard. Menu labels remain in English.

> **Water supply — Thursday**  
> Water will be available from 10:00 to 14:00 on 12 September.  
> Please store what you require. We regret the inconvenience.  
> — Management, Opus Galaxy Apartments

---

## 6. Organisation of the platform

```text
Havena
 └── Pakistan
       └── Punjab
             └── Lahore                         City / location
                   └── Opus Galaxy Apartments   Society / community
                         ├── Management
                         ├── Residents (by unit)
                         └── Guests
```

- Residents of another Lahore society cannot see Opus Galaxy notices.
- A subsequent society in Lahore receives its own membership and notice board.
- This office administers Opus Galaxy Apartments only.

---

## 7. Support and exception handling

**Unable to sign in.** Use https://gohavena.com/login, not the resident portal. Request a new OTP and check Spam.

**Dashboard remains pending.** Write to hello@gohavena.com and identify the account as Opus Galaxy Apartments, Lahore.

**Resident cannot see notices.** Confirm membership and the invited email. Re-invite if necessary.

**Incorrect invitation issued.** Do not circulate further codes. Contact Havena to remove the membership if required.

**Billing or Plaid opened in error.** Close the page. Neither function is used in Pakistan.

**Additional administrator required.** Request a second account from Havena. Each officer should use a distinct email address.

---

## 8. Account provisioning checklist

If the administrator login has not yet been issued, send the following in a single email to **hello@gohavena.com**:

- Society name: **Opus Galaxy Apartments**
- City: **Lahore**
- Full street address
- Administrator full name
- Administrator email (this will be the login)
- Administrator telephone
- Approximate number of units

Havena will create the society, approve the administrator, and confirm when sign-in is available. No payment card is required.

### Quick reference

- **Administrator:** https://gohavena.com/login  
- **Resident:** https://gohavena.com/resident-login  
- **Support:** hello@gohavena.com  
- **First-day sequence:** Sign in → OTP → Profile → Members → Notices → Rules and Documents → Amenities  
- **Not required in Lahore:** payment card, Billing, Plaid  

---

*Havena · Operations Manual v1.0 · Opus Galaxy Apartments, Lahore · 9 September 2026*  
*Intended for society management. Circulate Section 4 to residents as needed.*
