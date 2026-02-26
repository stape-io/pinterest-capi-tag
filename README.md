# Pinterest Conversion API Tag for Google Tag Manager Server-Side

The **Pinterest Conversion API Tag** for Google Tag Manager Server-Side allows you to send site events and parameters directly to Pinterest servers using the [Pinterest Conversion API (v5)](https://developers.pinterest.com/docs/api/v5/). It works with GA4 or the custom [Data Client](https://github.com/stape-io/data-client) inside the GTM Server-Side container.

The tag supports standard and custom events, event deduplication, real-time server event testing, and automatic SHA-256 hashing of user data.

## How to use the Pinterest Conversion API Tag

1. Add the **Pinterest Conversion API Tag** to your server container in GTM.
2. Choose your **Event Name Setup Method**: select a standard event, set a custom event name, or choose "Inherit from client" to automatically map GA4 events to Pinterest standard events.
3. Enter your **Pinterest Advertiser ID** and **API Access Token**.
4. Configure the **Server Event Data Override**, **User Data**, and **Custom Data** parameters as needed.
5. Add a trigger to fire the tag (e.g., on a custom event or a GA4 client claim).

## Event Name Setup

You can configure how events are sent in three ways:

- **Standard**: Manually select one of the supported Pinterest event names from a dropdown list.
- **Inherit from client**: The tag automatically maps common GA4 event names to their Pinterest equivalents (e.g., `page_view` → `page_visit`, `purchase` → `checkout`, `add_to_cart` → `add_to_cart`). If an event cannot be mapped, it defaults to `custom`.
- **Custom**: Set the event name manually if using the `custom` option in the standard dropdown.


## Parameters

### Main Configuration

- **Pinterest Advertiser ID**: Your Advertiser ID starting with `549`. You can find it in [Pinterest Ads](https://ads.pinterest.com) under the navigation dropdown or in the browser URL.
- **API Access Token**: Required to authenticate with the Pinterest Conversion API. You can obtain it in [Pinterest Ads](https://ads.pinterest.com) under _Conversions > Conversions API > Set up API_.
- **Action Source**: Defines where the event originated. Options: `Web`, `Offline`, `App iOS`, `App Android`. Defaults to `Web`.
- **Test Mode**: When enabled, events are not recorded but the API returns the same response messages. Use this to verify your setup.
- **Use Optimistic Scenario**: The tag will call `gtmOnSuccess()` immediately without waiting for a response from the API. This speeds up sGTM response time, but the tag will always report success even if the request fails.

### Server Event Data Override

Override or set server-side event parameters. Available properties:

- Event Time
- Source URL
- Opt Out
- Event ID
- App id / App name / App version
- Device brand / Device carrier / Device model / Device type
- OS version
- WiFi
- Language

### User Data

Override or set user data parameters sent with the event. If a parameter requires hashing (per Pinterest documentation), the tag will automatically SHA-256 hash it before sending.

- Email
- Phone
- Gender
- Date of Birth
- Last Name / First Name
- City / State / Zip / Country
- MAIDs (Mobile Advertiser IDs)
- Client IP Address
- Client User Agent
- External ID
- Click ID

### Custom Data

Override or set custom/product data parameters:

- Currency
- Value
- Content IDs
- Contents
- Num Items
- Order ID
- Search String
- Opt Out Type
- Content Name / Content Category / Content Brand
- Predicted Lifetime Value (LTV)

### Tag Execution Consent Settings

Control whether the tag respects marketing consent:

- **Send data always**: The tag fires regardless of consent status.
- **Send data in case marketing consent given**: Aborts execution if marketing consent (`ad_storage` via Google Consent Mode or Stape's Data Tag parameter) is not granted.

### Logs Settings

Choose the console logging behavior:

- **Do not log**: No logging.
- **Log to console during debug and preview** (default): Logs requests and responses only during GTM preview mode.
- **Always log to console**: Logs all requests and responses.

### BigQuery Logs Settings

Optionally log request and response data to a BigQuery table. When enabled, you must provide:

- **BigQuery Project ID** (optional — defaults to the `GOOGLE_CLOUD_PROJECT` environment variable)
- **BigQuery Dataset ID**
- **BigQuery Table ID**

## Useful Resources

- [How to set up Pinterest Conversion API](https://stape.io/blog/pinterest-conversion-api)

## Open Source

The **Pinterest Conversion API Tag for GTM Server-Side** is developed and maintained by the [Stape Team](https://stape.io/) under the Apache 2.0 license.
