const computeEffectiveTldPlusOne = require('computeEffectiveTldPlusOne');
const createRegex = require('createRegex');
const encodeUri = require('encodeUri');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const makeInteger = require('makeInteger');
const makeString = require('makeString');
const Math = require('Math');
const Object = require('Object');
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

const WHITESPACE_REGEX = createRegex('[\\s\\p{Z}]', 'g');
const PUNCTUATION_REGEX = createRegex('[\\p{P}\\p{S}]', 'g');
const NON_DIGITS_REGEX = createRegex('[^0-9]', 'g');
const ZIP_SEPARATORS_REGEX = createRegex('[\\s\\p{Z}\\p{Pd}]', 'g');

setClickIdCookieIfNeeded(data, eventData);

const mappedEventData = mapEvent(eventData, data);

sendEvent(data, mappedEventData);

if (data.useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function sendEvent(data, mappedEventData) {
  const postUrl =
    'https://api.pinterest.com/v5/ad_accounts/' +
    encodeUri(data.advertiserId) +
    '/events' +
    (isUIFieldTrue(data.testMode) ? '?test=true' : '');
  const postBody = { data: [mappedEventData] };

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
}

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
    action_source: getActionSource(data),
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
  mappedData = hashDataIfNeeded(mappedData);
  mappedData = cleanupData(mappedData);

  return mappedData;
}

function getActionSource(data) {
  if (!isValidValue(data.actionSource)) return 'web';
  return makeString(data.actionSource).trim().toLowerCase() || 'web';
}

function hashData(value, normalize) {
  if (!value) return value;

  const type = getType(value);

  if (value === 'undefined' || value === 'null') return undefined;

  if (type === 'array') {
    const hashedValues = value.map((val) => hashData(val, normalize)).filter((val) => !!val);
    return hashedValues.length ? hashedValues : undefined;
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      acc[val] = hashData(value[val], normalize);
      return acc;
    }, {});
  }

  if (isHashed(value)) return value;

  const normalizedValue = normalize(makeString(value));
  if (!normalizedValue) return undefined;

  return sha256Sync(normalizedValue, { outputEncoding: 'hex' });
}

function hashDataIfNeeded(mappedData) {
  const userData = mappedData.user_data;
  if (!userData) return mappedData;

  // Normalization rules from the Pinterest API user_data schema.
  const fieldsToNormalize = {
    em: normalizeLowercase,
    ph: normalizePhone,
    ge: normalizeGender,
    db: normalizeDateOfBirth,
    fn: normalizeLowercase,
    ln: normalizeLowercase,
    ct: normalizeCityOrState,
    st: normalizeCityOrState,
    zp: normalizeZip,
    country: normalizeLowercase,
    hashed_maids: normalizeLowercase,
    external_id: normalizeLowercase
  };

  Object.keys(fieldsToNormalize).forEach((key) => {
    if (!userData.hasOwnProperty(key)) return;

    const hashedValue = hashData(userData[key], fieldsToNormalize[key]);
    const type = getType(hashedValue);

    if (!hashedValue) userData[key] = undefined;
    else if (type === 'array' || type === 'object') userData[key] = hashedValue;
    else userData[key] = [hashedValue];
  });

  return mappedData;
}

function removeMatches(value, regex) {
  if (!regex || getType(value) !== 'string') return undefined;
  return value.replace(regex, '');
}

function removeWhitespace(value) {
  return removeMatches(value, WHITESPACE_REGEX);
}

function removePunctuation(value) {
  return removeMatches(value, PUNCTUATION_REGEX);
}

function onlyDigits(value) {
  return removeMatches(value, NON_DIGITS_REGEX);
}

function normalizeLowercase(value) {
  return value.trim().toLowerCase();
}

function normalizePhone(value) {
  let phone = onlyDigits(value);
  if (!phone) return phone;
  while (phone.length && phone.charAt(0) === '0') phone = phone.substring(1);
  return phone;
}

function normalizeGender(value) {
  const gender = normalizeLowercase(value);
  if (gender === 'female' || gender === 'woman') return 'f';
  if (gender === 'male' || gender === 'man') return 'm';
  if (
    gender === 'non-binary' ||
    gender === 'nonbinary' ||
    gender === 'non_binary' ||
    gender === 'non binary'
  ) {
    return 'n';
  }
  return gender;
}

function normalizeDateOfBirth(value) {
  // Year, month and day, e.g. 1990-01-15 becomes 19900115.
  return onlyDigits(value);
}

function normalizeCityOrState(value) {
  return removeWhitespace(removePunctuation(normalizeLowercase(value)));
}

function normalizeZip(value) {
  const zip = removeMatches(normalizeLowercase(value), ZIP_SEPARATORS_REGEX);
  if (!zip) return zip;
  // US ZIP+4 (e.g. 98101-1234): keep only the first 5 digits.
  if (zip.length === 9 && onlyDigits(zip) === zip) return zip.substring(0, 5);
  return zip;
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

    // Pinterest recommends IP address and user agent for all action sources.
    if (eventData.ip_override) mappedData.user_data.client_ip_address = eventData.ip_override;
    if (eventData.user_agent) mappedData.user_data.client_user_agent = eventData.user_agent;

    const externalId = eventData.external_id || eventData.user_id || eventData.userId;
    if (externalId) mappedData.user_data.external_id = externalId;

    const lastName =
      eventData.lastName ||
      eventData.LastName ||
      eventData.nameLast ||
      eventData.last_name ||
      user_data.last_name ||
      address.last_name ||
      address.sha256_last_name;
    if (lastName) mappedData.user_data.ln = lastName;

    const firstName =
      eventData.firstName ||
      eventData.FirstName ||
      eventData.nameFirst ||
      eventData.first_name ||
      user_data.first_name ||
      address.first_name ||
      address.sha256_first_name;
    if (firstName) mappedData.user_data.fn = firstName;

    const email =
      eventData.email ||
      user_data.email_address ||
      user_data.email ||
      user_data.sha256_email_address;
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

    const customerType = eventData.customer_type;
    if (customerType) mappedData.user_data.customer_type = customerType;
  }

  return mappedData;
}

function addServerEventData(eventData, mappedData) {
  const autoMapEnabled = data.hasOwnProperty('autoMapServerEventDataParameters')
    ? data.autoMapServerEventDataParameters
    : true;

  if (autoMapEnabled) {
    if (eventData.page_location) mappedData.event_source_url = eventData.page_location;

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

function setClickIdCookieIfNeeded(data, eventData) {
  if (data.notSetClickIdCookie) return;

  const clickId = parseClickIdFromUrl(eventData);
  if (!clickId) return;

  const expirationInDays = makeInteger(data.cookieExpiration) || 365;
  setCookie('_epik', clickId, {
    domain: getCookieDomain(data.cookieDomain, eventData),
    path: '/',
    samesite: data.cookieSameSite || 'Lax',
    secure: true,
    httpOnly: isUIFieldTrue(data.useHttpOnlyCookie),
    'max-age': 60 * 60 * 24 * expirationInDays
  });
}

function fixValueTypes(mappedData) {
  if (getType(mappedData.custom_data.value) === 'number') {
    mappedData.custom_data.value = makeString(mappedData.custom_data.value);
  }

  if (getType(mappedData.custom_data.external_measurement_vendor_id) === 'string') {
    mappedData.custom_data.external_measurement_vendor_id = makeInteger(
      mappedData.custom_data.external_measurement_vendor_id
    );
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

function getCookieDomain(cookieDomain, eventData) {
  return !cookieDomain || cookieDomain === 'auto'
    ? computeEffectiveTldPlusOne(eventData.page_location || getRequestHeader('referer')) || 'auto'
    : cookieDomain;
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
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

function isValidValue(value) {
  const valueType = getType(value);
  if (valueType === 'null' || valueType === 'undefined' || value !== value) return false;
  return value !== '' && value !== 'undefined' && value !== 'null';
}
