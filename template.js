const JSON = require('JSON');
const Math = require('Math');
const Object = require('Object');
const encodeUri = require('encodeUri');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const makeInteger = require('makeInteger');
const makeString = require('makeString');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if (shouldExitEarly(data, eventData)) {
  return data.gtmOnSuccess();
}

setClickIdCookieIfNeeded(eventData);

let postUrl =
  'https://api.pinterest.com/v5/ad_accounts/' + encodeUri(data.advertiserId) + '/events';
const mappedEventData = mapEvent(eventData, data);
const postBody = { data: [mappedEventData] };

if (data.testMode) {
  postUrl = postUrl + '?test=true';
}

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    if (!data.useOptimisticScenario) {
      if (statusCode >= 200 && statusCode < 300) return data.gtmOnSuccess();
      return data.gtmOnFailure();
    }
  },
  {
    headers: {
      'content-type': 'application/json',
      Authorization: 'Bearer ' + data.apiAccessToken
    },
    method: 'POST'
  },
  JSON.stringify(postBody)
);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    const eventName = eventData.event_name.toLowerCase().trim();
    const gaToEventName = {
      page_view: 'page_visit',
      'gtm.dom': 'page_visit',
      add_payment_info: 'add_payment_info',
      add_to_cart: 'add_to_cart',
      add_to_wishlist: 'add_to_wishlist',
      sign_up: 'signup',
      begin_checkout: 'initiate_checkout',
      generate_lead: 'lead',
      purchase: 'checkout',
      search: 'search',
      view_item_list: 'view_category',
      view_item: 'view_content',

      contact: 'lead',
      customize_product: 'custom',
      donate: 'custom',
      find_location: 'search',
      schedule: 'custom',
      start_trial: 'custom',
      submit_application: 'lead',
      subscribe: 'subscribe',

      'gtm4wp.addProductToCartEEC': 'add_to_cart',
      'gtm4wp.productClickEEC': 'custom',
      'gtm4wp.checkoutOptionEEC': 'custom',
      'gtm4wp.checkoutStepEEC': 'initiate_checkout',
      'gtm4wp.orderCompletedEEC': 'checkout'
    };

    return gaToEventName[eventName] || 'custom';
  }
  return data.eventType === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function mapEvent(eventData, data) {
  const eventName = getEventName(eventData, data);

  let mappedData = {
    event_name: eventName,
    action_source: data.actionSource || 'web',
    partner_name: 'ss-stape',
    custom_data: {
      np: 'ss-stape'
    },
    user_data: {}
  };

  mappedData = addServerEventData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addEcommerceData(eventData, mappedData);
  mappedData = overrideDataIfNeeded(data, mappedData);
  mappedData = fixValueTypes(mappedData);
  mappedData = cleanupData(mappedData);
  mappedData = hashDataIfNeeded(mappedData);

  return mappedData;
}

function hashData(key, value) {
  if (!value) return value;

  const type = getType(value);

  if (value === 'undefined' || value === 'null') return undefined;

  if (type === 'array') {
    return value.map((val) => hashData(key, val));
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      acc[val] = hashData(val, value[val]);
      return acc;
    }, {});
  }

  if (isHashed(value)) return value;

  value = makeString(value).trim().toLowerCase();

  if (key === 'ph') {
    value = value
      .split(' ')
      .join('')
      .split('-')
      .join('')
      .split('(')
      .join('')
      .split(')')
      .join('')
      .split('+')
      .join('');
  } else if (key === 'ct') {
    value = value.split(' ').join('');
  }

  return sha256Sync(value, { outputEncoding: 'hex' });
}

function hashDataIfNeeded(mappedData) {
  if (mappedData.user_data) {
    for (let key in mappedData.user_data) {
      if (
        key === 'em' ||
        key === 'ph' ||
        key === 'ge' ||
        key === 'db' ||
        key === 'ln' ||
        key === 'fn' ||
        key === 'ct' ||
        key === 'st' ||
        key === 'zp' ||
        key === 'country' ||
        key === 'hashed_maids' ||
        key === 'external_id'
      ) {
        let hashedValue = hashData(key, mappedData.user_data[key]);
        const type = getType(hashedValue);

        if (type !== 'undefined' && hashedValue !== 'undefined') {
          if (type !== 'object' && type !== 'array') {
            hashedValue = [hashedValue];
          }

          mappedData.user_data[key] = hashedValue;
        }
      }
    }
  }

  return mappedData;
}

function overrideDataIfNeeded(data, mappedData) {
  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      mappedData.user_data[d.name] = d.value;
    });
  }

  if (data.customDataList) {
    data.customDataList.forEach((d) => {
      mappedData.custom_data[d.name] = d.value;
    });
  }

  if (data.serverEventDataList) {
    data.serverEventDataList.forEach((d) => {
      mappedData[d.name] = d.value;
    });
  }

  return mappedData;
}

function cleanupData(mappedData) {
  if (mappedData.user_data) {
    const userData = {};

    for (let userDataKey in mappedData.user_data) {
      if (mappedData.user_data[userDataKey]) {
        userData[userDataKey] = mappedData.user_data[userDataKey];
      }
    }

    mappedData.user_data = userData;
  }

  if (mappedData.custom_data) {
    const customData = {};

    for (let customDataKey in mappedData.custom_data) {
      if (mappedData.custom_data[customDataKey] || customDataKey === 'value') {
        customData[customDataKey] = mappedData.custom_data[customDataKey];
      }
    }

    mappedData.custom_data = customData;
  }

  return mappedData;
}

function addEcommerceData(eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapCustomDataParameters')
    ? data.autoMapCustomDataParameters
    : true;

  if (autoMapEnabled) {
    let items;
    let currencyFromItems = '';
    let valueFromItems = 0;
    let numItems = 0;
    const contentIds = [];

    if (getType(eventData.items) === 'array' && eventData.items.length) items = eventData.items;
    else if (
      getType(eventData.ecommerce) === 'object' &&
      getType(eventData.ecommerce.items) === 'array' &&
      eventData.ecommerce.items.length
    ) {
      items = eventData.ecommerce.items;
    }

    if (getType(items) === 'array' && items.length) {
      mappedData.custom_data.contents = [];
      currencyFromItems = items[0].currency;

      items.forEach((d) => {
        let content = {};

        if (d.item_id) {
          const id = makeString(d.item_id);
          content.id = id;
          contentIds.push(id);
        }
        if (d.quantity) {
          content.quantity = makeInteger(d.quantity);
          numItems += makeInteger(d.quantity);
        }

        if (d.price) {
          content.item_price = makeString(d.price);
          valueFromItems += d.quantity ? d.quantity * d.price : d.price;
        }

        mappedData.custom_data.contents.push(content);
      });
    }

    const value =
      eventData['x-ga-mp1-ev'] || eventData['x-ga-mp1-tr'] || eventData.value || valueFromItems;
    if (value) mappedData.custom_data.value = makeString(value);

    const currency = eventData.currency || currencyFromItems;
    if (currency) mappedData.custom_data.currency = currency;

    if (contentIds.length) mappedData.custom_data.content_ids = contentIds;
    if (numItems) mappedData.custom_data.num_items = makeInteger(numItems);

    if (eventData.search_term) mappedData.custom_data.search_string = eventData.search_term;
    if (eventData.transaction_id) mappedData.custom_data.order_id = eventData.transaction_id;

    if (eventData.opt_out_type) mappedData.custom_data.opt_out_type = eventData.opt_out_type;
    if (eventData.content_name) mappedData.custom_data.content_name = eventData.content_name;
    if (eventData.content_category)
      mappedData.custom_data.content_category = eventData.content_category;
    if (eventData.content_brand) mappedData.custom_data.content_brand = eventData.content_brand;
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapUserDataParameters')
    ? data.autoMapUserDataParameters
    : true;

  if (autoMapEnabled) {
    let address = {};
    let user_data = {};

    if (getType(eventData.user_data) === 'object') {
      user_data = eventData.user_data;
      const addressType = getType(user_data.address);
      if (addressType === 'object' || addressType === 'array') {
        address = user_data.address[0] || user_data.address;
      }
    }

    if (mappedData.action_source === 'web') {
      if (eventData.ip_override) mappedData.user_data.client_ip_address = eventData.ip_override;
      if (eventData.user_agent) mappedData.user_data.client_user_agent = eventData.user_agent;
    }

    const externalId = eventData.external_id || eventData.user_id || eventData.userId;
    if (externalId) mappedData.user_data.external_id = externalId;

    const lastName =
      eventData.lastName ||
      eventData.LastName ||
      eventData.nameLast ||
      eventData.last_name ||
      user_data.last_name ||
      address.last_name;
    if (lastName) mappedData.user_data.ln = lastName;

    const firstName =
      eventData.firstName ||
      eventData.FirstName ||
      eventData.nameFirst ||
      eventData.first_name ||
      user_data.first_name ||
      address.first_name;
    if (firstName) mappedData.user_data.fn = firstName;

    const email = eventData.email || user_data.email_address || user_data.email || user_data.sha256_email_address;
    if (email) mappedData.user_data.em = email;

    const phone = eventData.phone || user_data.phone_number;
    if (phone) mappedData.user_data.ph = phone;

    const city = eventData.city || address.city;
    if (city) mappedData.user_data.ct = city;

    const state = eventData.state || eventData.region || user_data.region || address.region;
    if (state) mappedData.user_data.st = state;

    const zip =
      eventData.zip || eventData.postal_code || user_data.postal_code || address.postal_code;
    if (zip) mappedData.user_data.zp = zip;

    const countryCode =
      eventData.countryCode || eventData.country || user_data.country || address.country;
    if (countryCode) mappedData.user_data.country = countryCode;

    if (eventData.gender) mappedData.user_data.ge = eventData.gender;
    if (eventData.db) mappedData.user_data.db = eventData.db;
    if (eventData.hashed_maids) mappedData.user_data.hashed_maids = eventData.hashed_maids;

    const commonCookie = eventData.common_cookie || {};
    const clickId =
      parseClickIdFromUrl(eventData) ||
      getCookieValues('_epik')[0] ||
      commonCookie._epik ||
      eventData._epik ||
      eventData.epik ||
      eventData.click_id ||
      '';
    if (clickId) mappedData.user_data.click_id = clickId;
  }

  return mappedData;
}

function addServerEventData(eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapServerEventDataParameters')
    ? data.autoMapServerEventDataParameters
    : true;

  if (autoMapEnabled) {
    if (mappedData.action_source === 'web') {
      if (eventData.page_location) mappedData.event_source_url = eventData.page_location;
    }

    mappedData.event_time = Math.round(getTimestampMillis() / 1000);

    const eventId = eventData.event_id || eventData.transaction_id;
    if (eventId) mappedData.event_id = eventId;
  }

  return mappedData;
}

function parseClickIdFromUrl(eventData) {
  const url = getUrl(eventData);
  const searchParams = (parseUrl(url) || {}).searchParams || {};
  return searchParams.epik;
}

function setClickIdCookieIfNeeded(eventData) {
  const clickId = parseClickIdFromUrl(eventData);
  if (clickId) {
    setCookie('_epik', clickId, {
      domain: 'auto',
      path: '/',
      samesite: 'Lax',
      secure: true,
      httpOnly: false,
      'max-age': 31536000 // 1 year
    });
  }
}

function fixValueTypes(mappedData) {
  if (getType(mappedData.custom_data.value) === 'number') {
    mappedData.custom_data.value = makeString(mappedData.custom_data.value);
  }

  if (mappedData.custom_data.contents) {
    if (getType(mappedData.custom_data.contents) === 'string') {
      mappedData.custom_data.contents = JSON.parse(mappedData.custom_data.contents);
    }
    if (getType(mappedData.custom_data.contents) === 'array') {
      mappedData.custom_data.contents.forEach((content) => {
        if (getType(content.item_price) === 'number') {
          content.item_price = makeString(content.item_price);
        }
      });
    }
  }

  if (getType(mappedData.custom_data.content_ids) === 'string') {
    if (
      mappedData.custom_data.content_ids[0] === '[' &&
      mappedData.custom_data.content_ids[mappedData.custom_data.content_ids.length - 1] === ']'
    ) {
      const contentIds = JSON.parse(mappedData.custom_data.content_ids);
      if (getType(contentIds) === 'array') mappedData.custom_data.content_ids = contentIds;
    } else {
      mappedData.custom_data.content_ids = [mappedData.custom_data.content_ids];
    }
  }

  return mappedData;
}

/*==============================================================================
  Helpers
==============================================================================*/

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) return true;

  const url = getUrl(eventData);
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) return true;

  return false;
}

function getUrl(eventData) {
  return eventData.page_location || eventData.page_referrer || getRequestHeader('referer');
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
