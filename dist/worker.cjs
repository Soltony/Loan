"use strict";
"use server";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/lib/logger.ts
async function writeLog(level, message3) {
  try {
    import_fs.default.mkdirSync(LOG_DIR, { recursive: true });
    const fileName = import_path.default.join(LOG_DIR, `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.log`);
    const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] [pid:${process.pid}] [${level}] ${message3}
`;
    import_fs.default.appendFileSync(fileName, line, { encoding: "utf8" });
  } catch (err) {
    console.error("Logger failed to write:", err);
  }
}
var import_fs, import_path, LOG_DIR, logger, logger_default;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    import_fs = __toESM(require("fs"));
    import_path = __toESM(require("path"));
    LOG_DIR = process.env.LOG_DIR || import_path.default.resolve(process.cwd(), "logs");
    logger = {
      info: (msg) => writeLog("INFO", msg),
      warn: (msg) => writeLog("WARN", msg),
      error: (msg) => writeLog("ERROR", msg),
      debug: (msg) => writeLog("DEBUG", msg)
    };
    logger_default = logger;
  }
});

// node_modules/date-fns/toDate.mjs
function toDate(argument) {
  const argStr = Object.prototype.toString.call(argument);
  if (argument instanceof Date || typeof argument === "object" && argStr === "[object Date]") {
    return new argument.constructor(+argument);
  } else if (typeof argument === "number" || argStr === "[object Number]" || typeof argument === "string" || argStr === "[object String]") {
    return new Date(argument);
  } else {
    return /* @__PURE__ */ new Date(NaN);
  }
}
var init_toDate = __esm({
  "node_modules/date-fns/toDate.mjs"() {
  }
});

// node_modules/date-fns/constructFrom.mjs
function constructFrom(date, value) {
  if (date instanceof Date) {
    return new date.constructor(value);
  } else {
    return new Date(value);
  }
}
var init_constructFrom = __esm({
  "node_modules/date-fns/constructFrom.mjs"() {
  }
});

// node_modules/date-fns/addDays.mjs
function addDays(date, amount) {
  const _date = toDate(date);
  if (isNaN(amount)) return constructFrom(date, NaN);
  if (!amount) {
    return _date;
  }
  _date.setDate(_date.getDate() + amount);
  return _date;
}
var init_addDays = __esm({
  "node_modules/date-fns/addDays.mjs"() {
    init_toDate();
    init_constructFrom();
  }
});

// node_modules/date-fns/addMonths.mjs
var init_addMonths = __esm({
  "node_modules/date-fns/addMonths.mjs"() {
  }
});

// node_modules/date-fns/add.mjs
var init_add = __esm({
  "node_modules/date-fns/add.mjs"() {
  }
});

// node_modules/date-fns/isSaturday.mjs
var init_isSaturday = __esm({
  "node_modules/date-fns/isSaturday.mjs"() {
  }
});

// node_modules/date-fns/isSunday.mjs
var init_isSunday = __esm({
  "node_modules/date-fns/isSunday.mjs"() {
  }
});

// node_modules/date-fns/isWeekend.mjs
var init_isWeekend = __esm({
  "node_modules/date-fns/isWeekend.mjs"() {
  }
});

// node_modules/date-fns/addBusinessDays.mjs
var init_addBusinessDays = __esm({
  "node_modules/date-fns/addBusinessDays.mjs"() {
  }
});

// node_modules/date-fns/addMilliseconds.mjs
var init_addMilliseconds = __esm({
  "node_modules/date-fns/addMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/constants.mjs
var daysInYear, maxTime, minTime, millisecondsInWeek, millisecondsInDay, secondsInHour, secondsInDay, secondsInWeek, secondsInYear, secondsInMonth, secondsInQuarter;
var init_constants = __esm({
  "node_modules/date-fns/constants.mjs"() {
    daysInYear = 365.2425;
    maxTime = Math.pow(10, 8) * 24 * 60 * 60 * 1e3;
    minTime = -maxTime;
    millisecondsInWeek = 6048e5;
    millisecondsInDay = 864e5;
    secondsInHour = 3600;
    secondsInDay = secondsInHour * 24;
    secondsInWeek = secondsInDay * 7;
    secondsInYear = secondsInDay * daysInYear;
    secondsInMonth = secondsInYear / 12;
    secondsInQuarter = secondsInMonth * 3;
  }
});

// node_modules/date-fns/addHours.mjs
var init_addHours = __esm({
  "node_modules/date-fns/addHours.mjs"() {
  }
});

// node_modules/date-fns/_lib/defaultOptions.mjs
function getDefaultOptions() {
  return defaultOptions;
}
var defaultOptions;
var init_defaultOptions = __esm({
  "node_modules/date-fns/_lib/defaultOptions.mjs"() {
    defaultOptions = {};
  }
});

// node_modules/date-fns/startOfWeek.mjs
function startOfWeek(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const _date = toDate(date);
  const day2 = _date.getDay();
  const diff = (day2 < weekStartsOn ? 7 : 0) + day2 - weekStartsOn;
  _date.setDate(_date.getDate() - diff);
  _date.setHours(0, 0, 0, 0);
  return _date;
}
var init_startOfWeek = __esm({
  "node_modules/date-fns/startOfWeek.mjs"() {
    init_toDate();
    init_defaultOptions();
  }
});

// node_modules/date-fns/startOfISOWeek.mjs
function startOfISOWeek(date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}
var init_startOfISOWeek = __esm({
  "node_modules/date-fns/startOfISOWeek.mjs"() {
    init_startOfWeek();
  }
});

// node_modules/date-fns/getISOWeekYear.mjs
function getISOWeekYear(date) {
  const _date = toDate(date);
  const year2 = _date.getFullYear();
  const fourthOfJanuaryOfNextYear = constructFrom(date, 0);
  fourthOfJanuaryOfNextYear.setFullYear(year2 + 1, 0, 4);
  fourthOfJanuaryOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfISOWeek(fourthOfJanuaryOfNextYear);
  const fourthOfJanuaryOfThisYear = constructFrom(date, 0);
  fourthOfJanuaryOfThisYear.setFullYear(year2, 0, 4);
  fourthOfJanuaryOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfISOWeek(fourthOfJanuaryOfThisYear);
  if (_date.getTime() >= startOfNextYear.getTime()) {
    return year2 + 1;
  } else if (_date.getTime() >= startOfThisYear.getTime()) {
    return year2;
  } else {
    return year2 - 1;
  }
}
var init_getISOWeekYear = __esm({
  "node_modules/date-fns/getISOWeekYear.mjs"() {
    init_constructFrom();
    init_startOfISOWeek();
    init_toDate();
  }
});

// node_modules/date-fns/startOfDay.mjs
function startOfDay(date) {
  const _date = toDate(date);
  _date.setHours(0, 0, 0, 0);
  return _date;
}
var init_startOfDay = __esm({
  "node_modules/date-fns/startOfDay.mjs"() {
    init_toDate();
  }
});

// node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.mjs
function getTimezoneOffsetInMilliseconds(date) {
  const _date = toDate(date);
  const utcDate = new Date(
    Date.UTC(
      _date.getFullYear(),
      _date.getMonth(),
      _date.getDate(),
      _date.getHours(),
      _date.getMinutes(),
      _date.getSeconds(),
      _date.getMilliseconds()
    )
  );
  utcDate.setUTCFullYear(_date.getFullYear());
  return +date - +utcDate;
}
var init_getTimezoneOffsetInMilliseconds = __esm({
  "node_modules/date-fns/_lib/getTimezoneOffsetInMilliseconds.mjs"() {
    init_toDate();
  }
});

// node_modules/date-fns/differenceInCalendarDays.mjs
function differenceInCalendarDays(dateLeft, dateRight) {
  const startOfDayLeft = startOfDay(dateLeft);
  const startOfDayRight = startOfDay(dateRight);
  const timestampLeft = +startOfDayLeft - getTimezoneOffsetInMilliseconds(startOfDayLeft);
  const timestampRight = +startOfDayRight - getTimezoneOffsetInMilliseconds(startOfDayRight);
  return Math.round((timestampLeft - timestampRight) / millisecondsInDay);
}
var init_differenceInCalendarDays = __esm({
  "node_modules/date-fns/differenceInCalendarDays.mjs"() {
    init_constants();
    init_startOfDay();
    init_getTimezoneOffsetInMilliseconds();
  }
});

// node_modules/date-fns/startOfISOWeekYear.mjs
function startOfISOWeekYear(date) {
  const year2 = getISOWeekYear(date);
  const fourthOfJanuary = constructFrom(date, 0);
  fourthOfJanuary.setFullYear(year2, 0, 4);
  fourthOfJanuary.setHours(0, 0, 0, 0);
  return startOfISOWeek(fourthOfJanuary);
}
var init_startOfISOWeekYear = __esm({
  "node_modules/date-fns/startOfISOWeekYear.mjs"() {
    init_getISOWeekYear();
    init_startOfISOWeek();
    init_constructFrom();
  }
});

// node_modules/date-fns/setISOWeekYear.mjs
var init_setISOWeekYear = __esm({
  "node_modules/date-fns/setISOWeekYear.mjs"() {
  }
});

// node_modules/date-fns/addISOWeekYears.mjs
var init_addISOWeekYears = __esm({
  "node_modules/date-fns/addISOWeekYears.mjs"() {
  }
});

// node_modules/date-fns/addMinutes.mjs
var init_addMinutes = __esm({
  "node_modules/date-fns/addMinutes.mjs"() {
  }
});

// node_modules/date-fns/addQuarters.mjs
var init_addQuarters = __esm({
  "node_modules/date-fns/addQuarters.mjs"() {
  }
});

// node_modules/date-fns/addSeconds.mjs
var init_addSeconds = __esm({
  "node_modules/date-fns/addSeconds.mjs"() {
  }
});

// node_modules/date-fns/addWeeks.mjs
var init_addWeeks = __esm({
  "node_modules/date-fns/addWeeks.mjs"() {
  }
});

// node_modules/date-fns/addYears.mjs
var init_addYears = __esm({
  "node_modules/date-fns/addYears.mjs"() {
  }
});

// node_modules/date-fns/areIntervalsOverlapping.mjs
var init_areIntervalsOverlapping = __esm({
  "node_modules/date-fns/areIntervalsOverlapping.mjs"() {
  }
});

// node_modules/date-fns/max.mjs
var init_max = __esm({
  "node_modules/date-fns/max.mjs"() {
  }
});

// node_modules/date-fns/min.mjs
var init_min = __esm({
  "node_modules/date-fns/min.mjs"() {
  }
});

// node_modules/date-fns/clamp.mjs
var init_clamp = __esm({
  "node_modules/date-fns/clamp.mjs"() {
  }
});

// node_modules/date-fns/closestIndexTo.mjs
var init_closestIndexTo = __esm({
  "node_modules/date-fns/closestIndexTo.mjs"() {
  }
});

// node_modules/date-fns/closestTo.mjs
var init_closestTo = __esm({
  "node_modules/date-fns/closestTo.mjs"() {
  }
});

// node_modules/date-fns/compareAsc.mjs
var init_compareAsc = __esm({
  "node_modules/date-fns/compareAsc.mjs"() {
  }
});

// node_modules/date-fns/compareDesc.mjs
var init_compareDesc = __esm({
  "node_modules/date-fns/compareDesc.mjs"() {
  }
});

// node_modules/date-fns/constructNow.mjs
var init_constructNow = __esm({
  "node_modules/date-fns/constructNow.mjs"() {
  }
});

// node_modules/date-fns/daysToWeeks.mjs
var init_daysToWeeks = __esm({
  "node_modules/date-fns/daysToWeeks.mjs"() {
  }
});

// node_modules/date-fns/isSameDay.mjs
var init_isSameDay = __esm({
  "node_modules/date-fns/isSameDay.mjs"() {
  }
});

// node_modules/date-fns/isDate.mjs
function isDate(value) {
  return value instanceof Date || typeof value === "object" && Object.prototype.toString.call(value) === "[object Date]";
}
var init_isDate = __esm({
  "node_modules/date-fns/isDate.mjs"() {
  }
});

// node_modules/date-fns/isValid.mjs
function isValid(date) {
  if (!isDate(date) && typeof date !== "number") {
    return false;
  }
  const _date = toDate(date);
  return !isNaN(Number(_date));
}
var init_isValid = __esm({
  "node_modules/date-fns/isValid.mjs"() {
    init_isDate();
    init_toDate();
  }
});

// node_modules/date-fns/differenceInBusinessDays.mjs
var init_differenceInBusinessDays = __esm({
  "node_modules/date-fns/differenceInBusinessDays.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarISOWeekYears.mjs
var init_differenceInCalendarISOWeekYears = __esm({
  "node_modules/date-fns/differenceInCalendarISOWeekYears.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarISOWeeks.mjs
var init_differenceInCalendarISOWeeks = __esm({
  "node_modules/date-fns/differenceInCalendarISOWeeks.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarMonths.mjs
var init_differenceInCalendarMonths = __esm({
  "node_modules/date-fns/differenceInCalendarMonths.mjs"() {
  }
});

// node_modules/date-fns/getQuarter.mjs
var init_getQuarter = __esm({
  "node_modules/date-fns/getQuarter.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarQuarters.mjs
var init_differenceInCalendarQuarters = __esm({
  "node_modules/date-fns/differenceInCalendarQuarters.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarWeeks.mjs
var init_differenceInCalendarWeeks = __esm({
  "node_modules/date-fns/differenceInCalendarWeeks.mjs"() {
  }
});

// node_modules/date-fns/differenceInCalendarYears.mjs
var init_differenceInCalendarYears = __esm({
  "node_modules/date-fns/differenceInCalendarYears.mjs"() {
  }
});

// node_modules/date-fns/differenceInDays.mjs
function differenceInDays(dateLeft, dateRight) {
  const _dateLeft = toDate(dateLeft);
  const _dateRight = toDate(dateRight);
  const sign3 = compareLocalAsc(_dateLeft, _dateRight);
  const difference = Math.abs(differenceInCalendarDays(_dateLeft, _dateRight));
  _dateLeft.setDate(_dateLeft.getDate() - sign3 * difference);
  const isLastDayNotFull = Number(
    compareLocalAsc(_dateLeft, _dateRight) === -sign3
  );
  const result = sign3 * (difference - isLastDayNotFull);
  return result === 0 ? 0 : result;
}
function compareLocalAsc(dateLeft, dateRight) {
  const diff = dateLeft.getFullYear() - dateRight.getFullYear() || dateLeft.getMonth() - dateRight.getMonth() || dateLeft.getDate() - dateRight.getDate() || dateLeft.getHours() - dateRight.getHours() || dateLeft.getMinutes() - dateRight.getMinutes() || dateLeft.getSeconds() - dateRight.getSeconds() || dateLeft.getMilliseconds() - dateRight.getMilliseconds();
  if (diff < 0) {
    return -1;
  } else if (diff > 0) {
    return 1;
  } else {
    return diff;
  }
}
var init_differenceInDays = __esm({
  "node_modules/date-fns/differenceInDays.mjs"() {
    init_differenceInCalendarDays();
    init_toDate();
  }
});

// node_modules/date-fns/differenceInMilliseconds.mjs
var init_differenceInMilliseconds = __esm({
  "node_modules/date-fns/differenceInMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/differenceInHours.mjs
var init_differenceInHours = __esm({
  "node_modules/date-fns/differenceInHours.mjs"() {
  }
});

// node_modules/date-fns/subISOWeekYears.mjs
var init_subISOWeekYears = __esm({
  "node_modules/date-fns/subISOWeekYears.mjs"() {
  }
});

// node_modules/date-fns/differenceInISOWeekYears.mjs
var init_differenceInISOWeekYears = __esm({
  "node_modules/date-fns/differenceInISOWeekYears.mjs"() {
  }
});

// node_modules/date-fns/differenceInMinutes.mjs
var init_differenceInMinutes = __esm({
  "node_modules/date-fns/differenceInMinutes.mjs"() {
  }
});

// node_modules/date-fns/endOfDay.mjs
var init_endOfDay = __esm({
  "node_modules/date-fns/endOfDay.mjs"() {
  }
});

// node_modules/date-fns/endOfMonth.mjs
var init_endOfMonth = __esm({
  "node_modules/date-fns/endOfMonth.mjs"() {
  }
});

// node_modules/date-fns/isLastDayOfMonth.mjs
var init_isLastDayOfMonth = __esm({
  "node_modules/date-fns/isLastDayOfMonth.mjs"() {
  }
});

// node_modules/date-fns/differenceInMonths.mjs
var init_differenceInMonths = __esm({
  "node_modules/date-fns/differenceInMonths.mjs"() {
  }
});

// node_modules/date-fns/differenceInQuarters.mjs
var init_differenceInQuarters = __esm({
  "node_modules/date-fns/differenceInQuarters.mjs"() {
  }
});

// node_modules/date-fns/differenceInSeconds.mjs
var init_differenceInSeconds = __esm({
  "node_modules/date-fns/differenceInSeconds.mjs"() {
  }
});

// node_modules/date-fns/differenceInWeeks.mjs
var init_differenceInWeeks = __esm({
  "node_modules/date-fns/differenceInWeeks.mjs"() {
  }
});

// node_modules/date-fns/differenceInYears.mjs
var init_differenceInYears = __esm({
  "node_modules/date-fns/differenceInYears.mjs"() {
  }
});

// node_modules/date-fns/eachDayOfInterval.mjs
var init_eachDayOfInterval = __esm({
  "node_modules/date-fns/eachDayOfInterval.mjs"() {
  }
});

// node_modules/date-fns/eachHourOfInterval.mjs
var init_eachHourOfInterval = __esm({
  "node_modules/date-fns/eachHourOfInterval.mjs"() {
  }
});

// node_modules/date-fns/startOfMinute.mjs
var init_startOfMinute = __esm({
  "node_modules/date-fns/startOfMinute.mjs"() {
  }
});

// node_modules/date-fns/eachMinuteOfInterval.mjs
var init_eachMinuteOfInterval = __esm({
  "node_modules/date-fns/eachMinuteOfInterval.mjs"() {
  }
});

// node_modules/date-fns/eachMonthOfInterval.mjs
var init_eachMonthOfInterval = __esm({
  "node_modules/date-fns/eachMonthOfInterval.mjs"() {
  }
});

// node_modules/date-fns/startOfQuarter.mjs
var init_startOfQuarter = __esm({
  "node_modules/date-fns/startOfQuarter.mjs"() {
  }
});

// node_modules/date-fns/eachQuarterOfInterval.mjs
var init_eachQuarterOfInterval = __esm({
  "node_modules/date-fns/eachQuarterOfInterval.mjs"() {
  }
});

// node_modules/date-fns/eachWeekOfInterval.mjs
var init_eachWeekOfInterval = __esm({
  "node_modules/date-fns/eachWeekOfInterval.mjs"() {
  }
});

// node_modules/date-fns/eachWeekendOfInterval.mjs
var init_eachWeekendOfInterval = __esm({
  "node_modules/date-fns/eachWeekendOfInterval.mjs"() {
  }
});

// node_modules/date-fns/startOfMonth.mjs
var init_startOfMonth = __esm({
  "node_modules/date-fns/startOfMonth.mjs"() {
  }
});

// node_modules/date-fns/eachWeekendOfMonth.mjs
var init_eachWeekendOfMonth = __esm({
  "node_modules/date-fns/eachWeekendOfMonth.mjs"() {
  }
});

// node_modules/date-fns/endOfYear.mjs
var init_endOfYear = __esm({
  "node_modules/date-fns/endOfYear.mjs"() {
  }
});

// node_modules/date-fns/startOfYear.mjs
function startOfYear(date) {
  const cleanDate = toDate(date);
  const _date = constructFrom(date, 0);
  _date.setFullYear(cleanDate.getFullYear(), 0, 1);
  _date.setHours(0, 0, 0, 0);
  return _date;
}
var init_startOfYear = __esm({
  "node_modules/date-fns/startOfYear.mjs"() {
    init_toDate();
    init_constructFrom();
  }
});

// node_modules/date-fns/eachWeekendOfYear.mjs
var init_eachWeekendOfYear = __esm({
  "node_modules/date-fns/eachWeekendOfYear.mjs"() {
  }
});

// node_modules/date-fns/eachYearOfInterval.mjs
var init_eachYearOfInterval = __esm({
  "node_modules/date-fns/eachYearOfInterval.mjs"() {
  }
});

// node_modules/date-fns/endOfDecade.mjs
var init_endOfDecade = __esm({
  "node_modules/date-fns/endOfDecade.mjs"() {
  }
});

// node_modules/date-fns/endOfHour.mjs
var init_endOfHour = __esm({
  "node_modules/date-fns/endOfHour.mjs"() {
  }
});

// node_modules/date-fns/endOfWeek.mjs
var init_endOfWeek = __esm({
  "node_modules/date-fns/endOfWeek.mjs"() {
  }
});

// node_modules/date-fns/endOfISOWeek.mjs
var init_endOfISOWeek = __esm({
  "node_modules/date-fns/endOfISOWeek.mjs"() {
  }
});

// node_modules/date-fns/endOfISOWeekYear.mjs
var init_endOfISOWeekYear = __esm({
  "node_modules/date-fns/endOfISOWeekYear.mjs"() {
  }
});

// node_modules/date-fns/endOfMinute.mjs
var init_endOfMinute = __esm({
  "node_modules/date-fns/endOfMinute.mjs"() {
  }
});

// node_modules/date-fns/endOfQuarter.mjs
var init_endOfQuarter = __esm({
  "node_modules/date-fns/endOfQuarter.mjs"() {
  }
});

// node_modules/date-fns/endOfSecond.mjs
var init_endOfSecond = __esm({
  "node_modules/date-fns/endOfSecond.mjs"() {
  }
});

// node_modules/date-fns/endOfToday.mjs
var init_endOfToday = __esm({
  "node_modules/date-fns/endOfToday.mjs"() {
  }
});

// node_modules/date-fns/endOfTomorrow.mjs
var init_endOfTomorrow = __esm({
  "node_modules/date-fns/endOfTomorrow.mjs"() {
  }
});

// node_modules/date-fns/endOfYesterday.mjs
var init_endOfYesterday = __esm({
  "node_modules/date-fns/endOfYesterday.mjs"() {
  }
});

// node_modules/date-fns/locale/en-US/_lib/formatDistance.mjs
var formatDistanceLocale, formatDistance;
var init_formatDistance = __esm({
  "node_modules/date-fns/locale/en-US/_lib/formatDistance.mjs"() {
    formatDistanceLocale = {
      lessThanXSeconds: {
        one: "less than a second",
        other: "less than {{count}} seconds"
      },
      xSeconds: {
        one: "1 second",
        other: "{{count}} seconds"
      },
      halfAMinute: "half a minute",
      lessThanXMinutes: {
        one: "less than a minute",
        other: "less than {{count}} minutes"
      },
      xMinutes: {
        one: "1 minute",
        other: "{{count}} minutes"
      },
      aboutXHours: {
        one: "about 1 hour",
        other: "about {{count}} hours"
      },
      xHours: {
        one: "1 hour",
        other: "{{count}} hours"
      },
      xDays: {
        one: "1 day",
        other: "{{count}} days"
      },
      aboutXWeeks: {
        one: "about 1 week",
        other: "about {{count}} weeks"
      },
      xWeeks: {
        one: "1 week",
        other: "{{count}} weeks"
      },
      aboutXMonths: {
        one: "about 1 month",
        other: "about {{count}} months"
      },
      xMonths: {
        one: "1 month",
        other: "{{count}} months"
      },
      aboutXYears: {
        one: "about 1 year",
        other: "about {{count}} years"
      },
      xYears: {
        one: "1 year",
        other: "{{count}} years"
      },
      overXYears: {
        one: "over 1 year",
        other: "over {{count}} years"
      },
      almostXYears: {
        one: "almost 1 year",
        other: "almost {{count}} years"
      }
    };
    formatDistance = (token, count, options) => {
      let result;
      const tokenValue = formatDistanceLocale[token];
      if (typeof tokenValue === "string") {
        result = tokenValue;
      } else if (count === 1) {
        result = tokenValue.one;
      } else {
        result = tokenValue.other.replace("{{count}}", count.toString());
      }
      if (options?.addSuffix) {
        if (options.comparison && options.comparison > 0) {
          return "in " + result;
        } else {
          return result + " ago";
        }
      }
      return result;
    };
  }
});

// node_modules/date-fns/locale/_lib/buildFormatLongFn.mjs
function buildFormatLongFn(args) {
  return (options = {}) => {
    const width = options.width ? String(options.width) : args.defaultWidth;
    const format2 = args.formats[width] || args.formats[args.defaultWidth];
    return format2;
  };
}
var init_buildFormatLongFn = __esm({
  "node_modules/date-fns/locale/_lib/buildFormatLongFn.mjs"() {
  }
});

// node_modules/date-fns/locale/en-US/_lib/formatLong.mjs
var dateFormats, timeFormats, dateTimeFormats, formatLong;
var init_formatLong = __esm({
  "node_modules/date-fns/locale/en-US/_lib/formatLong.mjs"() {
    init_buildFormatLongFn();
    dateFormats = {
      full: "EEEE, MMMM do, y",
      long: "MMMM do, y",
      medium: "MMM d, y",
      short: "MM/dd/yyyy"
    };
    timeFormats = {
      full: "h:mm:ss a zzzz",
      long: "h:mm:ss a z",
      medium: "h:mm:ss a",
      short: "h:mm a"
    };
    dateTimeFormats = {
      full: "{{date}} 'at' {{time}}",
      long: "{{date}} 'at' {{time}}",
      medium: "{{date}}, {{time}}",
      short: "{{date}}, {{time}}"
    };
    formatLong = {
      date: buildFormatLongFn({
        formats: dateFormats,
        defaultWidth: "full"
      }),
      time: buildFormatLongFn({
        formats: timeFormats,
        defaultWidth: "full"
      }),
      dateTime: buildFormatLongFn({
        formats: dateTimeFormats,
        defaultWidth: "full"
      })
    };
  }
});

// node_modules/date-fns/locale/en-US/_lib/formatRelative.mjs
var formatRelativeLocale, formatRelative;
var init_formatRelative = __esm({
  "node_modules/date-fns/locale/en-US/_lib/formatRelative.mjs"() {
    formatRelativeLocale = {
      lastWeek: "'last' eeee 'at' p",
      yesterday: "'yesterday at' p",
      today: "'today at' p",
      tomorrow: "'tomorrow at' p",
      nextWeek: "eeee 'at' p",
      other: "P"
    };
    formatRelative = (token, _date, _baseDate, _options) => formatRelativeLocale[token];
  }
});

// node_modules/date-fns/locale/_lib/buildLocalizeFn.mjs
function buildLocalizeFn(args) {
  return (value, options) => {
    const context = options?.context ? String(options.context) : "standalone";
    let valuesArray;
    if (context === "formatting" && args.formattingValues) {
      const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
      const width = options?.width ? String(options.width) : defaultWidth;
      valuesArray = args.formattingValues[width] || args.formattingValues[defaultWidth];
    } else {
      const defaultWidth = args.defaultWidth;
      const width = options?.width ? String(options.width) : args.defaultWidth;
      valuesArray = args.values[width] || args.values[defaultWidth];
    }
    const index = args.argumentCallback ? args.argumentCallback(value) : value;
    return valuesArray[index];
  };
}
var init_buildLocalizeFn = __esm({
  "node_modules/date-fns/locale/_lib/buildLocalizeFn.mjs"() {
  }
});

// node_modules/date-fns/locale/en-US/_lib/localize.mjs
var eraValues, quarterValues, monthValues, dayValues, dayPeriodValues, formattingDayPeriodValues, ordinalNumber, localize;
var init_localize = __esm({
  "node_modules/date-fns/locale/en-US/_lib/localize.mjs"() {
    init_buildLocalizeFn();
    eraValues = {
      narrow: ["B", "A"],
      abbreviated: ["BC", "AD"],
      wide: ["Before Christ", "Anno Domini"]
    };
    quarterValues = {
      narrow: ["1", "2", "3", "4"],
      abbreviated: ["Q1", "Q2", "Q3", "Q4"],
      wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"]
    };
    monthValues = {
      narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
      abbreviated: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
      ],
      wide: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ]
    };
    dayValues = {
      narrow: ["S", "M", "T", "W", "T", "F", "S"],
      short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
      abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      wide: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday"
      ]
    };
    dayPeriodValues = {
      narrow: {
        am: "a",
        pm: "p",
        midnight: "mi",
        noon: "n",
        morning: "morning",
        afternoon: "afternoon",
        evening: "evening",
        night: "night"
      },
      abbreviated: {
        am: "AM",
        pm: "PM",
        midnight: "midnight",
        noon: "noon",
        morning: "morning",
        afternoon: "afternoon",
        evening: "evening",
        night: "night"
      },
      wide: {
        am: "a.m.",
        pm: "p.m.",
        midnight: "midnight",
        noon: "noon",
        morning: "morning",
        afternoon: "afternoon",
        evening: "evening",
        night: "night"
      }
    };
    formattingDayPeriodValues = {
      narrow: {
        am: "a",
        pm: "p",
        midnight: "mi",
        noon: "n",
        morning: "in the morning",
        afternoon: "in the afternoon",
        evening: "in the evening",
        night: "at night"
      },
      abbreviated: {
        am: "AM",
        pm: "PM",
        midnight: "midnight",
        noon: "noon",
        morning: "in the morning",
        afternoon: "in the afternoon",
        evening: "in the evening",
        night: "at night"
      },
      wide: {
        am: "a.m.",
        pm: "p.m.",
        midnight: "midnight",
        noon: "noon",
        morning: "in the morning",
        afternoon: "in the afternoon",
        evening: "in the evening",
        night: "at night"
      }
    };
    ordinalNumber = (dirtyNumber, _options) => {
      const number = Number(dirtyNumber);
      const rem100 = number % 100;
      if (rem100 > 20 || rem100 < 10) {
        switch (rem100 % 10) {
          case 1:
            return number + "st";
          case 2:
            return number + "nd";
          case 3:
            return number + "rd";
        }
      }
      return number + "th";
    };
    localize = {
      ordinalNumber,
      era: buildLocalizeFn({
        values: eraValues,
        defaultWidth: "wide"
      }),
      quarter: buildLocalizeFn({
        values: quarterValues,
        defaultWidth: "wide",
        argumentCallback: (quarter) => quarter - 1
      }),
      month: buildLocalizeFn({
        values: monthValues,
        defaultWidth: "wide"
      }),
      day: buildLocalizeFn({
        values: dayValues,
        defaultWidth: "wide"
      }),
      dayPeriod: buildLocalizeFn({
        values: dayPeriodValues,
        defaultWidth: "wide",
        formattingValues: formattingDayPeriodValues,
        defaultFormattingWidth: "wide"
      })
    };
  }
});

// node_modules/date-fns/locale/_lib/buildMatchFn.mjs
function buildMatchFn(args) {
  return (string, options = {}) => {
    const width = options.width;
    const matchPattern = width && args.matchPatterns[width] || args.matchPatterns[args.defaultMatchWidth];
    const matchResult = string.match(matchPattern);
    if (!matchResult) {
      return null;
    }
    const matchedString = matchResult[0];
    const parsePatterns = width && args.parsePatterns[width] || args.parsePatterns[args.defaultParseWidth];
    const key2 = Array.isArray(parsePatterns) ? findIndex(parsePatterns, (pattern) => pattern.test(matchedString)) : (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- I challange you to fix the type
      findKey(parsePatterns, (pattern) => pattern.test(matchedString))
    );
    let value;
    value = args.valueCallback ? args.valueCallback(key2) : key2;
    value = options.valueCallback ? (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- I challange you to fix the type
      options.valueCallback(value)
    ) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}
function findKey(object, predicate) {
  for (const key2 in object) {
    if (Object.prototype.hasOwnProperty.call(object, key2) && predicate(object[key2])) {
      return key2;
    }
  }
  return void 0;
}
function findIndex(array, predicate) {
  for (let key2 = 0; key2 < array.length; key2++) {
    if (predicate(array[key2])) {
      return key2;
    }
  }
  return void 0;
}
var init_buildMatchFn = __esm({
  "node_modules/date-fns/locale/_lib/buildMatchFn.mjs"() {
  }
});

// node_modules/date-fns/locale/_lib/buildMatchPatternFn.mjs
function buildMatchPatternFn(args) {
  return (string, options = {}) => {
    const matchResult = string.match(args.matchPattern);
    if (!matchResult) return null;
    const matchedString = matchResult[0];
    const parseResult = string.match(args.parsePattern);
    if (!parseResult) return null;
    let value = args.valueCallback ? args.valueCallback(parseResult[0]) : parseResult[0];
    value = options.valueCallback ? options.valueCallback(value) : value;
    const rest = string.slice(matchedString.length);
    return { value, rest };
  };
}
var init_buildMatchPatternFn = __esm({
  "node_modules/date-fns/locale/_lib/buildMatchPatternFn.mjs"() {
  }
});

// node_modules/date-fns/locale/en-US/_lib/match.mjs
var matchOrdinalNumberPattern, parseOrdinalNumberPattern, matchEraPatterns, parseEraPatterns, matchQuarterPatterns, parseQuarterPatterns, matchMonthPatterns, parseMonthPatterns, matchDayPatterns, parseDayPatterns, matchDayPeriodPatterns, parseDayPeriodPatterns, match;
var init_match = __esm({
  "node_modules/date-fns/locale/en-US/_lib/match.mjs"() {
    init_buildMatchFn();
    init_buildMatchPatternFn();
    matchOrdinalNumberPattern = /^(\d+)(th|st|nd|rd)?/i;
    parseOrdinalNumberPattern = /\d+/i;
    matchEraPatterns = {
      narrow: /^(b|a)/i,
      abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
      wide: /^(before christ|before common era|anno domini|common era)/i
    };
    parseEraPatterns = {
      any: [/^b/i, /^(a|c)/i]
    };
    matchQuarterPatterns = {
      narrow: /^[1234]/i,
      abbreviated: /^q[1234]/i,
      wide: /^[1234](th|st|nd|rd)? quarter/i
    };
    parseQuarterPatterns = {
      any: [/1/i, /2/i, /3/i, /4/i]
    };
    matchMonthPatterns = {
      narrow: /^[jfmasond]/i,
      abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
      wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
    };
    parseMonthPatterns = {
      narrow: [
        /^j/i,
        /^f/i,
        /^m/i,
        /^a/i,
        /^m/i,
        /^j/i,
        /^j/i,
        /^a/i,
        /^s/i,
        /^o/i,
        /^n/i,
        /^d/i
      ],
      any: [
        /^ja/i,
        /^f/i,
        /^mar/i,
        /^ap/i,
        /^may/i,
        /^jun/i,
        /^jul/i,
        /^au/i,
        /^s/i,
        /^o/i,
        /^n/i,
        /^d/i
      ]
    };
    matchDayPatterns = {
      narrow: /^[smtwf]/i,
      short: /^(su|mo|tu|we|th|fr|sa)/i,
      abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
      wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
    };
    parseDayPatterns = {
      narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
      any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
    };
    matchDayPeriodPatterns = {
      narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
      any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
    };
    parseDayPeriodPatterns = {
      any: {
        am: /^a/i,
        pm: /^p/i,
        midnight: /^mi/i,
        noon: /^no/i,
        morning: /morning/i,
        afternoon: /afternoon/i,
        evening: /evening/i,
        night: /night/i
      }
    };
    match = {
      ordinalNumber: buildMatchPatternFn({
        matchPattern: matchOrdinalNumberPattern,
        parsePattern: parseOrdinalNumberPattern,
        valueCallback: (value) => parseInt(value, 10)
      }),
      era: buildMatchFn({
        matchPatterns: matchEraPatterns,
        defaultMatchWidth: "wide",
        parsePatterns: parseEraPatterns,
        defaultParseWidth: "any"
      }),
      quarter: buildMatchFn({
        matchPatterns: matchQuarterPatterns,
        defaultMatchWidth: "wide",
        parsePatterns: parseQuarterPatterns,
        defaultParseWidth: "any",
        valueCallback: (index) => index + 1
      }),
      month: buildMatchFn({
        matchPatterns: matchMonthPatterns,
        defaultMatchWidth: "wide",
        parsePatterns: parseMonthPatterns,
        defaultParseWidth: "any"
      }),
      day: buildMatchFn({
        matchPatterns: matchDayPatterns,
        defaultMatchWidth: "wide",
        parsePatterns: parseDayPatterns,
        defaultParseWidth: "any"
      }),
      dayPeriod: buildMatchFn({
        matchPatterns: matchDayPeriodPatterns,
        defaultMatchWidth: "any",
        parsePatterns: parseDayPeriodPatterns,
        defaultParseWidth: "any"
      })
    };
  }
});

// node_modules/date-fns/locale/en-US.mjs
var enUS;
var init_en_US = __esm({
  "node_modules/date-fns/locale/en-US.mjs"() {
    init_formatDistance();
    init_formatLong();
    init_formatRelative();
    init_localize();
    init_match();
    enUS = {
      code: "en-US",
      formatDistance,
      formatLong,
      formatRelative,
      localize,
      match,
      options: {
        weekStartsOn: 0,
        firstWeekContainsDate: 1
      }
    };
  }
});

// node_modules/date-fns/_lib/defaultLocale.mjs
var init_defaultLocale = __esm({
  "node_modules/date-fns/_lib/defaultLocale.mjs"() {
    init_en_US();
  }
});

// node_modules/date-fns/getDayOfYear.mjs
function getDayOfYear(date) {
  const _date = toDate(date);
  const diff = differenceInCalendarDays(_date, startOfYear(_date));
  const dayOfYear = diff + 1;
  return dayOfYear;
}
var init_getDayOfYear = __esm({
  "node_modules/date-fns/getDayOfYear.mjs"() {
    init_differenceInCalendarDays();
    init_startOfYear();
    init_toDate();
  }
});

// node_modules/date-fns/getISOWeek.mjs
function getISOWeek(date) {
  const _date = toDate(date);
  const diff = +startOfISOWeek(_date) - +startOfISOWeekYear(_date);
  return Math.round(diff / millisecondsInWeek) + 1;
}
var init_getISOWeek = __esm({
  "node_modules/date-fns/getISOWeek.mjs"() {
    init_constants();
    init_startOfISOWeek();
    init_startOfISOWeekYear();
    init_toDate();
  }
});

// node_modules/date-fns/getWeekYear.mjs
function getWeekYear(date, options) {
  const _date = toDate(date);
  const year2 = _date.getFullYear();
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const firstWeekOfNextYear = constructFrom(date, 0);
  firstWeekOfNextYear.setFullYear(year2 + 1, 0, firstWeekContainsDate);
  firstWeekOfNextYear.setHours(0, 0, 0, 0);
  const startOfNextYear = startOfWeek(firstWeekOfNextYear, options);
  const firstWeekOfThisYear = constructFrom(date, 0);
  firstWeekOfThisYear.setFullYear(year2, 0, firstWeekContainsDate);
  firstWeekOfThisYear.setHours(0, 0, 0, 0);
  const startOfThisYear = startOfWeek(firstWeekOfThisYear, options);
  if (_date.getTime() >= startOfNextYear.getTime()) {
    return year2 + 1;
  } else if (_date.getTime() >= startOfThisYear.getTime()) {
    return year2;
  } else {
    return year2 - 1;
  }
}
var init_getWeekYear = __esm({
  "node_modules/date-fns/getWeekYear.mjs"() {
    init_constructFrom();
    init_startOfWeek();
    init_toDate();
    init_defaultOptions();
  }
});

// node_modules/date-fns/startOfWeekYear.mjs
function startOfWeekYear(date, options) {
  const defaultOptions2 = getDefaultOptions();
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const year2 = getWeekYear(date, options);
  const firstWeek = constructFrom(date, 0);
  firstWeek.setFullYear(year2, 0, firstWeekContainsDate);
  firstWeek.setHours(0, 0, 0, 0);
  const _date = startOfWeek(firstWeek, options);
  return _date;
}
var init_startOfWeekYear = __esm({
  "node_modules/date-fns/startOfWeekYear.mjs"() {
    init_constructFrom();
    init_getWeekYear();
    init_startOfWeek();
    init_defaultOptions();
  }
});

// node_modules/date-fns/getWeek.mjs
function getWeek(date, options) {
  const _date = toDate(date);
  const diff = +startOfWeek(_date, options) - +startOfWeekYear(_date, options);
  return Math.round(diff / millisecondsInWeek) + 1;
}
var init_getWeek = __esm({
  "node_modules/date-fns/getWeek.mjs"() {
    init_constants();
    init_startOfWeek();
    init_startOfWeekYear();
    init_toDate();
  }
});

// node_modules/date-fns/_lib/addLeadingZeros.mjs
function addLeadingZeros(number, targetLength) {
  const sign3 = number < 0 ? "-" : "";
  const output = Math.abs(number).toString().padStart(targetLength, "0");
  return sign3 + output;
}
var init_addLeadingZeros = __esm({
  "node_modules/date-fns/_lib/addLeadingZeros.mjs"() {
  }
});

// node_modules/date-fns/_lib/format/lightFormatters.mjs
var lightFormatters;
var init_lightFormatters = __esm({
  "node_modules/date-fns/_lib/format/lightFormatters.mjs"() {
    init_addLeadingZeros();
    lightFormatters = {
      // Year
      y(date, token) {
        const signedYear = date.getFullYear();
        const year2 = signedYear > 0 ? signedYear : 1 - signedYear;
        return addLeadingZeros(token === "yy" ? year2 % 100 : year2, token.length);
      },
      // Month
      M(date, token) {
        const month = date.getMonth();
        return token === "M" ? String(month + 1) : addLeadingZeros(month + 1, 2);
      },
      // Day of the month
      d(date, token) {
        return addLeadingZeros(date.getDate(), token.length);
      },
      // AM or PM
      a(date, token) {
        const dayPeriodEnumValue = date.getHours() / 12 >= 1 ? "pm" : "am";
        switch (token) {
          case "a":
          case "aa":
            return dayPeriodEnumValue.toUpperCase();
          case "aaa":
            return dayPeriodEnumValue;
          case "aaaaa":
            return dayPeriodEnumValue[0];
          case "aaaa":
          default:
            return dayPeriodEnumValue === "am" ? "a.m." : "p.m.";
        }
      },
      // Hour [1-12]
      h(date, token) {
        return addLeadingZeros(date.getHours() % 12 || 12, token.length);
      },
      // Hour [0-23]
      H(date, token) {
        return addLeadingZeros(date.getHours(), token.length);
      },
      // Minute
      m(date, token) {
        return addLeadingZeros(date.getMinutes(), token.length);
      },
      // Second
      s(date, token) {
        return addLeadingZeros(date.getSeconds(), token.length);
      },
      // Fraction of second
      S(date, token) {
        const numberOfDigits = token.length;
        const milliseconds = date.getMilliseconds();
        const fractionalSeconds = Math.trunc(
          milliseconds * Math.pow(10, numberOfDigits - 3)
        );
        return addLeadingZeros(fractionalSeconds, token.length);
      }
    };
  }
});

// node_modules/date-fns/_lib/format/formatters.mjs
function formatTimezoneShort(offset, delimiter = "") {
  const sign3 = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = Math.trunc(absOffset / 60);
  const minutes = absOffset % 60;
  if (minutes === 0) {
    return sign3 + String(hours);
  }
  return sign3 + String(hours) + delimiter + addLeadingZeros(minutes, 2);
}
function formatTimezoneWithOptionalMinutes(offset, delimiter) {
  if (offset % 60 === 0) {
    const sign3 = offset > 0 ? "-" : "+";
    return sign3 + addLeadingZeros(Math.abs(offset) / 60, 2);
  }
  return formatTimezone(offset, delimiter);
}
function formatTimezone(offset, delimiter = "") {
  const sign3 = offset > 0 ? "-" : "+";
  const absOffset = Math.abs(offset);
  const hours = addLeadingZeros(Math.trunc(absOffset / 60), 2);
  const minutes = addLeadingZeros(absOffset % 60, 2);
  return sign3 + hours + delimiter + minutes;
}
var dayPeriodEnum, formatters;
var init_formatters = __esm({
  "node_modules/date-fns/_lib/format/formatters.mjs"() {
    init_getDayOfYear();
    init_getISOWeek();
    init_getISOWeekYear();
    init_getWeek();
    init_getWeekYear();
    init_addLeadingZeros();
    init_lightFormatters();
    dayPeriodEnum = {
      am: "am",
      pm: "pm",
      midnight: "midnight",
      noon: "noon",
      morning: "morning",
      afternoon: "afternoon",
      evening: "evening",
      night: "night"
    };
    formatters = {
      // Era
      G: function(date, token, localize2) {
        const era = date.getFullYear() > 0 ? 1 : 0;
        switch (token) {
          // AD, BC
          case "G":
          case "GG":
          case "GGG":
            return localize2.era(era, { width: "abbreviated" });
          // A, B
          case "GGGGG":
            return localize2.era(era, { width: "narrow" });
          // Anno Domini, Before Christ
          case "GGGG":
          default:
            return localize2.era(era, { width: "wide" });
        }
      },
      // Year
      y: function(date, token, localize2) {
        if (token === "yo") {
          const signedYear = date.getFullYear();
          const year2 = signedYear > 0 ? signedYear : 1 - signedYear;
          return localize2.ordinalNumber(year2, { unit: "year" });
        }
        return lightFormatters.y(date, token);
      },
      // Local week-numbering year
      Y: function(date, token, localize2, options) {
        const signedWeekYear = getWeekYear(date, options);
        const weekYear = signedWeekYear > 0 ? signedWeekYear : 1 - signedWeekYear;
        if (token === "YY") {
          const twoDigitYear = weekYear % 100;
          return addLeadingZeros(twoDigitYear, 2);
        }
        if (token === "Yo") {
          return localize2.ordinalNumber(weekYear, { unit: "year" });
        }
        return addLeadingZeros(weekYear, token.length);
      },
      // ISO week-numbering year
      R: function(date, token) {
        const isoWeekYear = getISOWeekYear(date);
        return addLeadingZeros(isoWeekYear, token.length);
      },
      // Extended year. This is a single number designating the year of this calendar system.
      // The main difference between `y` and `u` localizers are B.C. years:
      // | Year | `y` | `u` |
      // |------|-----|-----|
      // | AC 1 |   1 |   1 |
      // | BC 1 |   1 |   0 |
      // | BC 2 |   2 |  -1 |
      // Also `yy` always returns the last two digits of a year,
      // while `uu` pads single digit years to 2 characters and returns other years unchanged.
      u: function(date, token) {
        const year2 = date.getFullYear();
        return addLeadingZeros(year2, token.length);
      },
      // Quarter
      Q: function(date, token, localize2) {
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        switch (token) {
          // 1, 2, 3, 4
          case "Q":
            return String(quarter);
          // 01, 02, 03, 04
          case "QQ":
            return addLeadingZeros(quarter, 2);
          // 1st, 2nd, 3rd, 4th
          case "Qo":
            return localize2.ordinalNumber(quarter, { unit: "quarter" });
          // Q1, Q2, Q3, Q4
          case "QQQ":
            return localize2.quarter(quarter, {
              width: "abbreviated",
              context: "formatting"
            });
          // 1, 2, 3, 4 (narrow quarter; could be not numerical)
          case "QQQQQ":
            return localize2.quarter(quarter, {
              width: "narrow",
              context: "formatting"
            });
          // 1st quarter, 2nd quarter, ...
          case "QQQQ":
          default:
            return localize2.quarter(quarter, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // Stand-alone quarter
      q: function(date, token, localize2) {
        const quarter = Math.ceil((date.getMonth() + 1) / 3);
        switch (token) {
          // 1, 2, 3, 4
          case "q":
            return String(quarter);
          // 01, 02, 03, 04
          case "qq":
            return addLeadingZeros(quarter, 2);
          // 1st, 2nd, 3rd, 4th
          case "qo":
            return localize2.ordinalNumber(quarter, { unit: "quarter" });
          // Q1, Q2, Q3, Q4
          case "qqq":
            return localize2.quarter(quarter, {
              width: "abbreviated",
              context: "standalone"
            });
          // 1, 2, 3, 4 (narrow quarter; could be not numerical)
          case "qqqqq":
            return localize2.quarter(quarter, {
              width: "narrow",
              context: "standalone"
            });
          // 1st quarter, 2nd quarter, ...
          case "qqqq":
          default:
            return localize2.quarter(quarter, {
              width: "wide",
              context: "standalone"
            });
        }
      },
      // Month
      M: function(date, token, localize2) {
        const month = date.getMonth();
        switch (token) {
          case "M":
          case "MM":
            return lightFormatters.M(date, token);
          // 1st, 2nd, ..., 12th
          case "Mo":
            return localize2.ordinalNumber(month + 1, { unit: "month" });
          // Jan, Feb, ..., Dec
          case "MMM":
            return localize2.month(month, {
              width: "abbreviated",
              context: "formatting"
            });
          // J, F, ..., D
          case "MMMMM":
            return localize2.month(month, {
              width: "narrow",
              context: "formatting"
            });
          // January, February, ..., December
          case "MMMM":
          default:
            return localize2.month(month, { width: "wide", context: "formatting" });
        }
      },
      // Stand-alone month
      L: function(date, token, localize2) {
        const month = date.getMonth();
        switch (token) {
          // 1, 2, ..., 12
          case "L":
            return String(month + 1);
          // 01, 02, ..., 12
          case "LL":
            return addLeadingZeros(month + 1, 2);
          // 1st, 2nd, ..., 12th
          case "Lo":
            return localize2.ordinalNumber(month + 1, { unit: "month" });
          // Jan, Feb, ..., Dec
          case "LLL":
            return localize2.month(month, {
              width: "abbreviated",
              context: "standalone"
            });
          // J, F, ..., D
          case "LLLLL":
            return localize2.month(month, {
              width: "narrow",
              context: "standalone"
            });
          // January, February, ..., December
          case "LLLL":
          default:
            return localize2.month(month, { width: "wide", context: "standalone" });
        }
      },
      // Local week of year
      w: function(date, token, localize2, options) {
        const week2 = getWeek(date, options);
        if (token === "wo") {
          return localize2.ordinalNumber(week2, { unit: "week" });
        }
        return addLeadingZeros(week2, token.length);
      },
      // ISO week of year
      I: function(date, token, localize2) {
        const isoWeek = getISOWeek(date);
        if (token === "Io") {
          return localize2.ordinalNumber(isoWeek, { unit: "week" });
        }
        return addLeadingZeros(isoWeek, token.length);
      },
      // Day of the month
      d: function(date, token, localize2) {
        if (token === "do") {
          return localize2.ordinalNumber(date.getDate(), { unit: "date" });
        }
        return lightFormatters.d(date, token);
      },
      // Day of year
      D: function(date, token, localize2) {
        const dayOfYear = getDayOfYear(date);
        if (token === "Do") {
          return localize2.ordinalNumber(dayOfYear, { unit: "dayOfYear" });
        }
        return addLeadingZeros(dayOfYear, token.length);
      },
      // Day of week
      E: function(date, token, localize2) {
        const dayOfWeek = date.getDay();
        switch (token) {
          // Tue
          case "E":
          case "EE":
          case "EEE":
            return localize2.day(dayOfWeek, {
              width: "abbreviated",
              context: "formatting"
            });
          // T
          case "EEEEE":
            return localize2.day(dayOfWeek, {
              width: "narrow",
              context: "formatting"
            });
          // Tu
          case "EEEEEE":
            return localize2.day(dayOfWeek, {
              width: "short",
              context: "formatting"
            });
          // Tuesday
          case "EEEE":
          default:
            return localize2.day(dayOfWeek, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // Local day of week
      e: function(date, token, localize2, options) {
        const dayOfWeek = date.getDay();
        const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
        switch (token) {
          // Numerical value (Nth day of week with current locale or weekStartsOn)
          case "e":
            return String(localDayOfWeek);
          // Padded numerical value
          case "ee":
            return addLeadingZeros(localDayOfWeek, 2);
          // 1st, 2nd, ..., 7th
          case "eo":
            return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
          case "eee":
            return localize2.day(dayOfWeek, {
              width: "abbreviated",
              context: "formatting"
            });
          // T
          case "eeeee":
            return localize2.day(dayOfWeek, {
              width: "narrow",
              context: "formatting"
            });
          // Tu
          case "eeeeee":
            return localize2.day(dayOfWeek, {
              width: "short",
              context: "formatting"
            });
          // Tuesday
          case "eeee":
          default:
            return localize2.day(dayOfWeek, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // Stand-alone local day of week
      c: function(date, token, localize2, options) {
        const dayOfWeek = date.getDay();
        const localDayOfWeek = (dayOfWeek - options.weekStartsOn + 8) % 7 || 7;
        switch (token) {
          // Numerical value (same as in `e`)
          case "c":
            return String(localDayOfWeek);
          // Padded numerical value
          case "cc":
            return addLeadingZeros(localDayOfWeek, token.length);
          // 1st, 2nd, ..., 7th
          case "co":
            return localize2.ordinalNumber(localDayOfWeek, { unit: "day" });
          case "ccc":
            return localize2.day(dayOfWeek, {
              width: "abbreviated",
              context: "standalone"
            });
          // T
          case "ccccc":
            return localize2.day(dayOfWeek, {
              width: "narrow",
              context: "standalone"
            });
          // Tu
          case "cccccc":
            return localize2.day(dayOfWeek, {
              width: "short",
              context: "standalone"
            });
          // Tuesday
          case "cccc":
          default:
            return localize2.day(dayOfWeek, {
              width: "wide",
              context: "standalone"
            });
        }
      },
      // ISO day of week
      i: function(date, token, localize2) {
        const dayOfWeek = date.getDay();
        const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
        switch (token) {
          // 2
          case "i":
            return String(isoDayOfWeek);
          // 02
          case "ii":
            return addLeadingZeros(isoDayOfWeek, token.length);
          // 2nd
          case "io":
            return localize2.ordinalNumber(isoDayOfWeek, { unit: "day" });
          // Tue
          case "iii":
            return localize2.day(dayOfWeek, {
              width: "abbreviated",
              context: "formatting"
            });
          // T
          case "iiiii":
            return localize2.day(dayOfWeek, {
              width: "narrow",
              context: "formatting"
            });
          // Tu
          case "iiiiii":
            return localize2.day(dayOfWeek, {
              width: "short",
              context: "formatting"
            });
          // Tuesday
          case "iiii":
          default:
            return localize2.day(dayOfWeek, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // AM or PM
      a: function(date, token, localize2) {
        const hours = date.getHours();
        const dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
        switch (token) {
          case "a":
          case "aa":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "abbreviated",
              context: "formatting"
            });
          case "aaa":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "abbreviated",
              context: "formatting"
            }).toLowerCase();
          case "aaaaa":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "narrow",
              context: "formatting"
            });
          case "aaaa":
          default:
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // AM, PM, midnight, noon
      b: function(date, token, localize2) {
        const hours = date.getHours();
        let dayPeriodEnumValue;
        if (hours === 12) {
          dayPeriodEnumValue = dayPeriodEnum.noon;
        } else if (hours === 0) {
          dayPeriodEnumValue = dayPeriodEnum.midnight;
        } else {
          dayPeriodEnumValue = hours / 12 >= 1 ? "pm" : "am";
        }
        switch (token) {
          case "b":
          case "bb":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "abbreviated",
              context: "formatting"
            });
          case "bbb":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "abbreviated",
              context: "formatting"
            }).toLowerCase();
          case "bbbbb":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "narrow",
              context: "formatting"
            });
          case "bbbb":
          default:
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // in the morning, in the afternoon, in the evening, at night
      B: function(date, token, localize2) {
        const hours = date.getHours();
        let dayPeriodEnumValue;
        if (hours >= 17) {
          dayPeriodEnumValue = dayPeriodEnum.evening;
        } else if (hours >= 12) {
          dayPeriodEnumValue = dayPeriodEnum.afternoon;
        } else if (hours >= 4) {
          dayPeriodEnumValue = dayPeriodEnum.morning;
        } else {
          dayPeriodEnumValue = dayPeriodEnum.night;
        }
        switch (token) {
          case "B":
          case "BB":
          case "BBB":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "abbreviated",
              context: "formatting"
            });
          case "BBBBB":
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "narrow",
              context: "formatting"
            });
          case "BBBB":
          default:
            return localize2.dayPeriod(dayPeriodEnumValue, {
              width: "wide",
              context: "formatting"
            });
        }
      },
      // Hour [1-12]
      h: function(date, token, localize2) {
        if (token === "ho") {
          let hours = date.getHours() % 12;
          if (hours === 0) hours = 12;
          return localize2.ordinalNumber(hours, { unit: "hour" });
        }
        return lightFormatters.h(date, token);
      },
      // Hour [0-23]
      H: function(date, token, localize2) {
        if (token === "Ho") {
          return localize2.ordinalNumber(date.getHours(), { unit: "hour" });
        }
        return lightFormatters.H(date, token);
      },
      // Hour [0-11]
      K: function(date, token, localize2) {
        const hours = date.getHours() % 12;
        if (token === "Ko") {
          return localize2.ordinalNumber(hours, { unit: "hour" });
        }
        return addLeadingZeros(hours, token.length);
      },
      // Hour [1-24]
      k: function(date, token, localize2) {
        let hours = date.getHours();
        if (hours === 0) hours = 24;
        if (token === "ko") {
          return localize2.ordinalNumber(hours, { unit: "hour" });
        }
        return addLeadingZeros(hours, token.length);
      },
      // Minute
      m: function(date, token, localize2) {
        if (token === "mo") {
          return localize2.ordinalNumber(date.getMinutes(), { unit: "minute" });
        }
        return lightFormatters.m(date, token);
      },
      // Second
      s: function(date, token, localize2) {
        if (token === "so") {
          return localize2.ordinalNumber(date.getSeconds(), { unit: "second" });
        }
        return lightFormatters.s(date, token);
      },
      // Fraction of second
      S: function(date, token) {
        return lightFormatters.S(date, token);
      },
      // Timezone (ISO-8601. If offset is 0, output is always `'Z'`)
      X: function(date, token, _localize) {
        const timezoneOffset = date.getTimezoneOffset();
        if (timezoneOffset === 0) {
          return "Z";
        }
        switch (token) {
          // Hours and optional minutes
          case "X":
            return formatTimezoneWithOptionalMinutes(timezoneOffset);
          // Hours, minutes and optional seconds without `:` delimiter
          // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
          // so this token always has the same output as `XX`
          case "XXXX":
          case "XX":
            return formatTimezone(timezoneOffset);
          // Hours, minutes and optional seconds with `:` delimiter
          // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
          // so this token always has the same output as `XXX`
          case "XXXXX":
          case "XXX":
          // Hours and minutes with `:` delimiter
          default:
            return formatTimezone(timezoneOffset, ":");
        }
      },
      // Timezone (ISO-8601. If offset is 0, output is `'+00:00'` or equivalent)
      x: function(date, token, _localize) {
        const timezoneOffset = date.getTimezoneOffset();
        switch (token) {
          // Hours and optional minutes
          case "x":
            return formatTimezoneWithOptionalMinutes(timezoneOffset);
          // Hours, minutes and optional seconds without `:` delimiter
          // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
          // so this token always has the same output as `xx`
          case "xxxx":
          case "xx":
            return formatTimezone(timezoneOffset);
          // Hours, minutes and optional seconds with `:` delimiter
          // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
          // so this token always has the same output as `xxx`
          case "xxxxx":
          case "xxx":
          // Hours and minutes with `:` delimiter
          default:
            return formatTimezone(timezoneOffset, ":");
        }
      },
      // Timezone (GMT)
      O: function(date, token, _localize) {
        const timezoneOffset = date.getTimezoneOffset();
        switch (token) {
          // Short
          case "O":
          case "OO":
          case "OOO":
            return "GMT" + formatTimezoneShort(timezoneOffset, ":");
          // Long
          case "OOOO":
          default:
            return "GMT" + formatTimezone(timezoneOffset, ":");
        }
      },
      // Timezone (specific non-location)
      z: function(date, token, _localize) {
        const timezoneOffset = date.getTimezoneOffset();
        switch (token) {
          // Short
          case "z":
          case "zz":
          case "zzz":
            return "GMT" + formatTimezoneShort(timezoneOffset, ":");
          // Long
          case "zzzz":
          default:
            return "GMT" + formatTimezone(timezoneOffset, ":");
        }
      },
      // Seconds timestamp
      t: function(date, token, _localize) {
        const timestamp = Math.trunc(date.getTime() / 1e3);
        return addLeadingZeros(timestamp, token.length);
      },
      // Milliseconds timestamp
      T: function(date, token, _localize) {
        const timestamp = date.getTime();
        return addLeadingZeros(timestamp, token.length);
      }
    };
  }
});

// node_modules/date-fns/_lib/format/longFormatters.mjs
var dateLongFormatter, timeLongFormatter, dateTimeLongFormatter, longFormatters;
var init_longFormatters = __esm({
  "node_modules/date-fns/_lib/format/longFormatters.mjs"() {
    dateLongFormatter = (pattern, formatLong2) => {
      switch (pattern) {
        case "P":
          return formatLong2.date({ width: "short" });
        case "PP":
          return formatLong2.date({ width: "medium" });
        case "PPP":
          return formatLong2.date({ width: "long" });
        case "PPPP":
        default:
          return formatLong2.date({ width: "full" });
      }
    };
    timeLongFormatter = (pattern, formatLong2) => {
      switch (pattern) {
        case "p":
          return formatLong2.time({ width: "short" });
        case "pp":
          return formatLong2.time({ width: "medium" });
        case "ppp":
          return formatLong2.time({ width: "long" });
        case "pppp":
        default:
          return formatLong2.time({ width: "full" });
      }
    };
    dateTimeLongFormatter = (pattern, formatLong2) => {
      const matchResult = pattern.match(/(P+)(p+)?/) || [];
      const datePattern = matchResult[1];
      const timePattern = matchResult[2];
      if (!timePattern) {
        return dateLongFormatter(pattern, formatLong2);
      }
      let dateTimeFormat;
      switch (datePattern) {
        case "P":
          dateTimeFormat = formatLong2.dateTime({ width: "short" });
          break;
        case "PP":
          dateTimeFormat = formatLong2.dateTime({ width: "medium" });
          break;
        case "PPP":
          dateTimeFormat = formatLong2.dateTime({ width: "long" });
          break;
        case "PPPP":
        default:
          dateTimeFormat = formatLong2.dateTime({ width: "full" });
          break;
      }
      return dateTimeFormat.replace("{{date}}", dateLongFormatter(datePattern, formatLong2)).replace("{{time}}", timeLongFormatter(timePattern, formatLong2));
    };
    longFormatters = {
      p: timeLongFormatter,
      P: dateTimeLongFormatter
    };
  }
});

// node_modules/date-fns/_lib/protectedTokens.mjs
function isProtectedDayOfYearToken(token) {
  return dayOfYearTokenRE.test(token);
}
function isProtectedWeekYearToken(token) {
  return weekYearTokenRE.test(token);
}
function warnOrThrowProtectedError(token, format2, input) {
  const _message = message(token, format2, input);
  console.warn(_message);
  if (throwTokens.includes(token)) throw new RangeError(_message);
}
function message(token, format2, input) {
  const subject = token[0] === "Y" ? "years" : "days of the month";
  return `Use \`${token.toLowerCase()}\` instead of \`${token}\` (in \`${format2}\`) for formatting ${subject} to the input \`${input}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
var dayOfYearTokenRE, weekYearTokenRE, throwTokens;
var init_protectedTokens = __esm({
  "node_modules/date-fns/_lib/protectedTokens.mjs"() {
    dayOfYearTokenRE = /^D+$/;
    weekYearTokenRE = /^Y+$/;
    throwTokens = ["D", "DD", "YY", "YYYY"];
  }
});

// node_modules/date-fns/format.mjs
function format(date, formatStr, options) {
  const defaultOptions2 = getDefaultOptions();
  const locale = options?.locale ?? defaultOptions2.locale ?? enUS;
  const firstWeekContainsDate = options?.firstWeekContainsDate ?? options?.locale?.options?.firstWeekContainsDate ?? defaultOptions2.firstWeekContainsDate ?? defaultOptions2.locale?.options?.firstWeekContainsDate ?? 1;
  const weekStartsOn = options?.weekStartsOn ?? options?.locale?.options?.weekStartsOn ?? defaultOptions2.weekStartsOn ?? defaultOptions2.locale?.options?.weekStartsOn ?? 0;
  const originalDate = toDate(date);
  if (!isValid(originalDate)) {
    throw new RangeError("Invalid time value");
  }
  let parts = formatStr.match(longFormattingTokensRegExp).map((substring) => {
    const firstCharacter = substring[0];
    if (firstCharacter === "p" || firstCharacter === "P") {
      const longFormatter = longFormatters[firstCharacter];
      return longFormatter(substring, locale.formatLong);
    }
    return substring;
  }).join("").match(formattingTokensRegExp).map((substring) => {
    if (substring === "''") {
      return { isToken: false, value: "'" };
    }
    const firstCharacter = substring[0];
    if (firstCharacter === "'") {
      return { isToken: false, value: cleanEscapedString(substring) };
    }
    if (formatters[firstCharacter]) {
      return { isToken: true, value: substring };
    }
    if (firstCharacter.match(unescapedLatinCharacterRegExp)) {
      throw new RangeError(
        "Format string contains an unescaped latin alphabet character `" + firstCharacter + "`"
      );
    }
    return { isToken: false, value: substring };
  });
  if (locale.localize.preprocessor) {
    parts = locale.localize.preprocessor(originalDate, parts);
  }
  const formatterOptions = {
    firstWeekContainsDate,
    weekStartsOn,
    locale
  };
  return parts.map((part) => {
    if (!part.isToken) return part.value;
    const token = part.value;
    if (!options?.useAdditionalWeekYearTokens && isProtectedWeekYearToken(token) || !options?.useAdditionalDayOfYearTokens && isProtectedDayOfYearToken(token)) {
      warnOrThrowProtectedError(token, formatStr, String(date));
    }
    const formatter = formatters[token[0]];
    return formatter(originalDate, token, locale.localize, formatterOptions);
  }).join("");
}
function cleanEscapedString(input) {
  const matched = input.match(escapedStringRegExp);
  if (!matched) {
    return input;
  }
  return matched[1].replace(doubleQuoteRegExp, "'");
}
var formattingTokensRegExp, longFormattingTokensRegExp, escapedStringRegExp, doubleQuoteRegExp, unescapedLatinCharacterRegExp;
var init_format = __esm({
  "node_modules/date-fns/format.mjs"() {
    init_defaultLocale();
    init_defaultOptions();
    init_formatters();
    init_longFormatters();
    init_protectedTokens();
    init_isValid();
    init_toDate();
    formattingTokensRegExp = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g;
    longFormattingTokensRegExp = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g;
    escapedStringRegExp = /^'([^]*?)'?$/;
    doubleQuoteRegExp = /''/g;
    unescapedLatinCharacterRegExp = /[a-zA-Z]/;
  }
});

// node_modules/date-fns/formatDistance.mjs
var init_formatDistance2 = __esm({
  "node_modules/date-fns/formatDistance.mjs"() {
  }
});

// node_modules/date-fns/formatDistanceStrict.mjs
var init_formatDistanceStrict = __esm({
  "node_modules/date-fns/formatDistanceStrict.mjs"() {
  }
});

// node_modules/date-fns/formatDistanceToNow.mjs
var init_formatDistanceToNow = __esm({
  "node_modules/date-fns/formatDistanceToNow.mjs"() {
  }
});

// node_modules/date-fns/formatDistanceToNowStrict.mjs
var init_formatDistanceToNowStrict = __esm({
  "node_modules/date-fns/formatDistanceToNowStrict.mjs"() {
  }
});

// node_modules/date-fns/formatDuration.mjs
var init_formatDuration = __esm({
  "node_modules/date-fns/formatDuration.mjs"() {
  }
});

// node_modules/date-fns/formatISO.mjs
var init_formatISO = __esm({
  "node_modules/date-fns/formatISO.mjs"() {
  }
});

// node_modules/date-fns/formatISO9075.mjs
var init_formatISO9075 = __esm({
  "node_modules/date-fns/formatISO9075.mjs"() {
  }
});

// node_modules/date-fns/formatISODuration.mjs
var init_formatISODuration = __esm({
  "node_modules/date-fns/formatISODuration.mjs"() {
  }
});

// node_modules/date-fns/formatRFC3339.mjs
var init_formatRFC3339 = __esm({
  "node_modules/date-fns/formatRFC3339.mjs"() {
  }
});

// node_modules/date-fns/formatRFC7231.mjs
var init_formatRFC7231 = __esm({
  "node_modules/date-fns/formatRFC7231.mjs"() {
  }
});

// node_modules/date-fns/formatRelative.mjs
var init_formatRelative2 = __esm({
  "node_modules/date-fns/formatRelative.mjs"() {
  }
});

// node_modules/date-fns/fromUnixTime.mjs
var init_fromUnixTime = __esm({
  "node_modules/date-fns/fromUnixTime.mjs"() {
  }
});

// node_modules/date-fns/getDate.mjs
var init_getDate = __esm({
  "node_modules/date-fns/getDate.mjs"() {
  }
});

// node_modules/date-fns/getDay.mjs
var init_getDay = __esm({
  "node_modules/date-fns/getDay.mjs"() {
  }
});

// node_modules/date-fns/getDaysInMonth.mjs
var init_getDaysInMonth = __esm({
  "node_modules/date-fns/getDaysInMonth.mjs"() {
  }
});

// node_modules/date-fns/isLeapYear.mjs
var init_isLeapYear = __esm({
  "node_modules/date-fns/isLeapYear.mjs"() {
  }
});

// node_modules/date-fns/getDaysInYear.mjs
var init_getDaysInYear = __esm({
  "node_modules/date-fns/getDaysInYear.mjs"() {
  }
});

// node_modules/date-fns/getDecade.mjs
var init_getDecade = __esm({
  "node_modules/date-fns/getDecade.mjs"() {
  }
});

// node_modules/date-fns/getDefaultOptions.mjs
var init_getDefaultOptions = __esm({
  "node_modules/date-fns/getDefaultOptions.mjs"() {
  }
});

// node_modules/date-fns/getHours.mjs
var init_getHours = __esm({
  "node_modules/date-fns/getHours.mjs"() {
  }
});

// node_modules/date-fns/getISODay.mjs
var init_getISODay = __esm({
  "node_modules/date-fns/getISODay.mjs"() {
  }
});

// node_modules/date-fns/getISOWeeksInYear.mjs
var init_getISOWeeksInYear = __esm({
  "node_modules/date-fns/getISOWeeksInYear.mjs"() {
  }
});

// node_modules/date-fns/getMilliseconds.mjs
var init_getMilliseconds = __esm({
  "node_modules/date-fns/getMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/getMinutes.mjs
var init_getMinutes = __esm({
  "node_modules/date-fns/getMinutes.mjs"() {
  }
});

// node_modules/date-fns/getMonth.mjs
var init_getMonth = __esm({
  "node_modules/date-fns/getMonth.mjs"() {
  }
});

// node_modules/date-fns/getOverlappingDaysInIntervals.mjs
var init_getOverlappingDaysInIntervals = __esm({
  "node_modules/date-fns/getOverlappingDaysInIntervals.mjs"() {
  }
});

// node_modules/date-fns/getSeconds.mjs
var init_getSeconds = __esm({
  "node_modules/date-fns/getSeconds.mjs"() {
  }
});

// node_modules/date-fns/getTime.mjs
var init_getTime = __esm({
  "node_modules/date-fns/getTime.mjs"() {
  }
});

// node_modules/date-fns/getUnixTime.mjs
var init_getUnixTime = __esm({
  "node_modules/date-fns/getUnixTime.mjs"() {
  }
});

// node_modules/date-fns/getWeekOfMonth.mjs
var init_getWeekOfMonth = __esm({
  "node_modules/date-fns/getWeekOfMonth.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfMonth.mjs
var init_lastDayOfMonth = __esm({
  "node_modules/date-fns/lastDayOfMonth.mjs"() {
  }
});

// node_modules/date-fns/getWeeksInMonth.mjs
var init_getWeeksInMonth = __esm({
  "node_modules/date-fns/getWeeksInMonth.mjs"() {
  }
});

// node_modules/date-fns/getYear.mjs
var init_getYear = __esm({
  "node_modules/date-fns/getYear.mjs"() {
  }
});

// node_modules/date-fns/hoursToMilliseconds.mjs
var init_hoursToMilliseconds = __esm({
  "node_modules/date-fns/hoursToMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/hoursToMinutes.mjs
var init_hoursToMinutes = __esm({
  "node_modules/date-fns/hoursToMinutes.mjs"() {
  }
});

// node_modules/date-fns/hoursToSeconds.mjs
var init_hoursToSeconds = __esm({
  "node_modules/date-fns/hoursToSeconds.mjs"() {
  }
});

// node_modules/date-fns/interval.mjs
var init_interval = __esm({
  "node_modules/date-fns/interval.mjs"() {
  }
});

// node_modules/date-fns/intervalToDuration.mjs
var init_intervalToDuration = __esm({
  "node_modules/date-fns/intervalToDuration.mjs"() {
  }
});

// node_modules/date-fns/intlFormat.mjs
var init_intlFormat = __esm({
  "node_modules/date-fns/intlFormat.mjs"() {
  }
});

// node_modules/date-fns/intlFormatDistance.mjs
var init_intlFormatDistance = __esm({
  "node_modules/date-fns/intlFormatDistance.mjs"() {
  }
});

// node_modules/date-fns/isAfter.mjs
var init_isAfter = __esm({
  "node_modules/date-fns/isAfter.mjs"() {
  }
});

// node_modules/date-fns/isBefore.mjs
var init_isBefore = __esm({
  "node_modules/date-fns/isBefore.mjs"() {
  }
});

// node_modules/date-fns/isEqual.mjs
var init_isEqual = __esm({
  "node_modules/date-fns/isEqual.mjs"() {
  }
});

// node_modules/date-fns/isExists.mjs
var init_isExists = __esm({
  "node_modules/date-fns/isExists.mjs"() {
  }
});

// node_modules/date-fns/isFirstDayOfMonth.mjs
var init_isFirstDayOfMonth = __esm({
  "node_modules/date-fns/isFirstDayOfMonth.mjs"() {
  }
});

// node_modules/date-fns/isFriday.mjs
var init_isFriday = __esm({
  "node_modules/date-fns/isFriday.mjs"() {
  }
});

// node_modules/date-fns/isFuture.mjs
var init_isFuture = __esm({
  "node_modules/date-fns/isFuture.mjs"() {
  }
});

// node_modules/date-fns/transpose.mjs
var init_transpose = __esm({
  "node_modules/date-fns/transpose.mjs"() {
  }
});

// node_modules/date-fns/setWeek.mjs
var init_setWeek = __esm({
  "node_modules/date-fns/setWeek.mjs"() {
  }
});

// node_modules/date-fns/setISOWeek.mjs
var init_setISOWeek = __esm({
  "node_modules/date-fns/setISOWeek.mjs"() {
  }
});

// node_modules/date-fns/setDay.mjs
var init_setDay = __esm({
  "node_modules/date-fns/setDay.mjs"() {
  }
});

// node_modules/date-fns/setISODay.mjs
var init_setISODay = __esm({
  "node_modules/date-fns/setISODay.mjs"() {
  }
});

// node_modules/date-fns/parse.mjs
var init_parse = __esm({
  "node_modules/date-fns/parse.mjs"() {
  }
});

// node_modules/date-fns/isMatch.mjs
var init_isMatch = __esm({
  "node_modules/date-fns/isMatch.mjs"() {
  }
});

// node_modules/date-fns/isMonday.mjs
var init_isMonday = __esm({
  "node_modules/date-fns/isMonday.mjs"() {
  }
});

// node_modules/date-fns/isPast.mjs
var init_isPast = __esm({
  "node_modules/date-fns/isPast.mjs"() {
  }
});

// node_modules/date-fns/startOfHour.mjs
var init_startOfHour = __esm({
  "node_modules/date-fns/startOfHour.mjs"() {
  }
});

// node_modules/date-fns/isSameHour.mjs
var init_isSameHour = __esm({
  "node_modules/date-fns/isSameHour.mjs"() {
  }
});

// node_modules/date-fns/isSameWeek.mjs
var init_isSameWeek = __esm({
  "node_modules/date-fns/isSameWeek.mjs"() {
  }
});

// node_modules/date-fns/isSameISOWeek.mjs
var init_isSameISOWeek = __esm({
  "node_modules/date-fns/isSameISOWeek.mjs"() {
  }
});

// node_modules/date-fns/isSameISOWeekYear.mjs
var init_isSameISOWeekYear = __esm({
  "node_modules/date-fns/isSameISOWeekYear.mjs"() {
  }
});

// node_modules/date-fns/isSameMinute.mjs
var init_isSameMinute = __esm({
  "node_modules/date-fns/isSameMinute.mjs"() {
  }
});

// node_modules/date-fns/isSameMonth.mjs
var init_isSameMonth = __esm({
  "node_modules/date-fns/isSameMonth.mjs"() {
  }
});

// node_modules/date-fns/isSameQuarter.mjs
var init_isSameQuarter = __esm({
  "node_modules/date-fns/isSameQuarter.mjs"() {
  }
});

// node_modules/date-fns/startOfSecond.mjs
var init_startOfSecond = __esm({
  "node_modules/date-fns/startOfSecond.mjs"() {
  }
});

// node_modules/date-fns/isSameSecond.mjs
var init_isSameSecond = __esm({
  "node_modules/date-fns/isSameSecond.mjs"() {
  }
});

// node_modules/date-fns/isSameYear.mjs
var init_isSameYear = __esm({
  "node_modules/date-fns/isSameYear.mjs"() {
  }
});

// node_modules/date-fns/isThisHour.mjs
var init_isThisHour = __esm({
  "node_modules/date-fns/isThisHour.mjs"() {
  }
});

// node_modules/date-fns/isThisISOWeek.mjs
var init_isThisISOWeek = __esm({
  "node_modules/date-fns/isThisISOWeek.mjs"() {
  }
});

// node_modules/date-fns/isThisMinute.mjs
var init_isThisMinute = __esm({
  "node_modules/date-fns/isThisMinute.mjs"() {
  }
});

// node_modules/date-fns/isThisMonth.mjs
var init_isThisMonth = __esm({
  "node_modules/date-fns/isThisMonth.mjs"() {
  }
});

// node_modules/date-fns/isThisQuarter.mjs
var init_isThisQuarter = __esm({
  "node_modules/date-fns/isThisQuarter.mjs"() {
  }
});

// node_modules/date-fns/isThisSecond.mjs
var init_isThisSecond = __esm({
  "node_modules/date-fns/isThisSecond.mjs"() {
  }
});

// node_modules/date-fns/isThisWeek.mjs
var init_isThisWeek = __esm({
  "node_modules/date-fns/isThisWeek.mjs"() {
  }
});

// node_modules/date-fns/isThisYear.mjs
var init_isThisYear = __esm({
  "node_modules/date-fns/isThisYear.mjs"() {
  }
});

// node_modules/date-fns/isThursday.mjs
var init_isThursday = __esm({
  "node_modules/date-fns/isThursday.mjs"() {
  }
});

// node_modules/date-fns/isToday.mjs
var init_isToday = __esm({
  "node_modules/date-fns/isToday.mjs"() {
  }
});

// node_modules/date-fns/isTomorrow.mjs
var init_isTomorrow = __esm({
  "node_modules/date-fns/isTomorrow.mjs"() {
  }
});

// node_modules/date-fns/isTuesday.mjs
var init_isTuesday = __esm({
  "node_modules/date-fns/isTuesday.mjs"() {
  }
});

// node_modules/date-fns/isWednesday.mjs
var init_isWednesday = __esm({
  "node_modules/date-fns/isWednesday.mjs"() {
  }
});

// node_modules/date-fns/isWithinInterval.mjs
var init_isWithinInterval = __esm({
  "node_modules/date-fns/isWithinInterval.mjs"() {
  }
});

// node_modules/date-fns/subDays.mjs
function subDays(date, amount) {
  return addDays(date, -amount);
}
var init_subDays = __esm({
  "node_modules/date-fns/subDays.mjs"() {
    init_addDays();
  }
});

// node_modules/date-fns/isYesterday.mjs
var init_isYesterday = __esm({
  "node_modules/date-fns/isYesterday.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfDecade.mjs
var init_lastDayOfDecade = __esm({
  "node_modules/date-fns/lastDayOfDecade.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfWeek.mjs
var init_lastDayOfWeek = __esm({
  "node_modules/date-fns/lastDayOfWeek.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfISOWeek.mjs
var init_lastDayOfISOWeek = __esm({
  "node_modules/date-fns/lastDayOfISOWeek.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfISOWeekYear.mjs
var init_lastDayOfISOWeekYear = __esm({
  "node_modules/date-fns/lastDayOfISOWeekYear.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfQuarter.mjs
var init_lastDayOfQuarter = __esm({
  "node_modules/date-fns/lastDayOfQuarter.mjs"() {
  }
});

// node_modules/date-fns/lastDayOfYear.mjs
var init_lastDayOfYear = __esm({
  "node_modules/date-fns/lastDayOfYear.mjs"() {
  }
});

// node_modules/date-fns/lightFormat.mjs
var init_lightFormat = __esm({
  "node_modules/date-fns/lightFormat.mjs"() {
  }
});

// node_modules/date-fns/milliseconds.mjs
var init_milliseconds = __esm({
  "node_modules/date-fns/milliseconds.mjs"() {
  }
});

// node_modules/date-fns/millisecondsToHours.mjs
var init_millisecondsToHours = __esm({
  "node_modules/date-fns/millisecondsToHours.mjs"() {
  }
});

// node_modules/date-fns/millisecondsToMinutes.mjs
var init_millisecondsToMinutes = __esm({
  "node_modules/date-fns/millisecondsToMinutes.mjs"() {
  }
});

// node_modules/date-fns/millisecondsToSeconds.mjs
var init_millisecondsToSeconds = __esm({
  "node_modules/date-fns/millisecondsToSeconds.mjs"() {
  }
});

// node_modules/date-fns/minutesToHours.mjs
var init_minutesToHours = __esm({
  "node_modules/date-fns/minutesToHours.mjs"() {
  }
});

// node_modules/date-fns/minutesToMilliseconds.mjs
var init_minutesToMilliseconds = __esm({
  "node_modules/date-fns/minutesToMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/minutesToSeconds.mjs
var init_minutesToSeconds = __esm({
  "node_modules/date-fns/minutesToSeconds.mjs"() {
  }
});

// node_modules/date-fns/monthsToQuarters.mjs
var init_monthsToQuarters = __esm({
  "node_modules/date-fns/monthsToQuarters.mjs"() {
  }
});

// node_modules/date-fns/monthsToYears.mjs
var init_monthsToYears = __esm({
  "node_modules/date-fns/monthsToYears.mjs"() {
  }
});

// node_modules/date-fns/nextDay.mjs
var init_nextDay = __esm({
  "node_modules/date-fns/nextDay.mjs"() {
  }
});

// node_modules/date-fns/nextFriday.mjs
var init_nextFriday = __esm({
  "node_modules/date-fns/nextFriday.mjs"() {
  }
});

// node_modules/date-fns/nextMonday.mjs
var init_nextMonday = __esm({
  "node_modules/date-fns/nextMonday.mjs"() {
  }
});

// node_modules/date-fns/nextSaturday.mjs
var init_nextSaturday = __esm({
  "node_modules/date-fns/nextSaturday.mjs"() {
  }
});

// node_modules/date-fns/nextSunday.mjs
var init_nextSunday = __esm({
  "node_modules/date-fns/nextSunday.mjs"() {
  }
});

// node_modules/date-fns/nextThursday.mjs
var init_nextThursday = __esm({
  "node_modules/date-fns/nextThursday.mjs"() {
  }
});

// node_modules/date-fns/nextTuesday.mjs
var init_nextTuesday = __esm({
  "node_modules/date-fns/nextTuesday.mjs"() {
  }
});

// node_modules/date-fns/nextWednesday.mjs
var init_nextWednesday = __esm({
  "node_modules/date-fns/nextWednesday.mjs"() {
  }
});

// node_modules/date-fns/parseISO.mjs
var init_parseISO = __esm({
  "node_modules/date-fns/parseISO.mjs"() {
  }
});

// node_modules/date-fns/parseJSON.mjs
var init_parseJSON = __esm({
  "node_modules/date-fns/parseJSON.mjs"() {
  }
});

// node_modules/date-fns/previousDay.mjs
var init_previousDay = __esm({
  "node_modules/date-fns/previousDay.mjs"() {
  }
});

// node_modules/date-fns/previousFriday.mjs
var init_previousFriday = __esm({
  "node_modules/date-fns/previousFriday.mjs"() {
  }
});

// node_modules/date-fns/previousMonday.mjs
var init_previousMonday = __esm({
  "node_modules/date-fns/previousMonday.mjs"() {
  }
});

// node_modules/date-fns/previousSaturday.mjs
var init_previousSaturday = __esm({
  "node_modules/date-fns/previousSaturday.mjs"() {
  }
});

// node_modules/date-fns/previousSunday.mjs
var init_previousSunday = __esm({
  "node_modules/date-fns/previousSunday.mjs"() {
  }
});

// node_modules/date-fns/previousThursday.mjs
var init_previousThursday = __esm({
  "node_modules/date-fns/previousThursday.mjs"() {
  }
});

// node_modules/date-fns/previousTuesday.mjs
var init_previousTuesday = __esm({
  "node_modules/date-fns/previousTuesday.mjs"() {
  }
});

// node_modules/date-fns/previousWednesday.mjs
var init_previousWednesday = __esm({
  "node_modules/date-fns/previousWednesday.mjs"() {
  }
});

// node_modules/date-fns/quartersToMonths.mjs
var init_quartersToMonths = __esm({
  "node_modules/date-fns/quartersToMonths.mjs"() {
  }
});

// node_modules/date-fns/quartersToYears.mjs
var init_quartersToYears = __esm({
  "node_modules/date-fns/quartersToYears.mjs"() {
  }
});

// node_modules/date-fns/roundToNearestHours.mjs
var init_roundToNearestHours = __esm({
  "node_modules/date-fns/roundToNearestHours.mjs"() {
  }
});

// node_modules/date-fns/roundToNearestMinutes.mjs
var init_roundToNearestMinutes = __esm({
  "node_modules/date-fns/roundToNearestMinutes.mjs"() {
  }
});

// node_modules/date-fns/secondsToHours.mjs
var init_secondsToHours = __esm({
  "node_modules/date-fns/secondsToHours.mjs"() {
  }
});

// node_modules/date-fns/secondsToMilliseconds.mjs
var init_secondsToMilliseconds = __esm({
  "node_modules/date-fns/secondsToMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/secondsToMinutes.mjs
var init_secondsToMinutes = __esm({
  "node_modules/date-fns/secondsToMinutes.mjs"() {
  }
});

// node_modules/date-fns/setMonth.mjs
var init_setMonth = __esm({
  "node_modules/date-fns/setMonth.mjs"() {
  }
});

// node_modules/date-fns/set.mjs
var init_set = __esm({
  "node_modules/date-fns/set.mjs"() {
  }
});

// node_modules/date-fns/setDate.mjs
var init_setDate = __esm({
  "node_modules/date-fns/setDate.mjs"() {
  }
});

// node_modules/date-fns/setDayOfYear.mjs
var init_setDayOfYear = __esm({
  "node_modules/date-fns/setDayOfYear.mjs"() {
  }
});

// node_modules/date-fns/setDefaultOptions.mjs
var init_setDefaultOptions = __esm({
  "node_modules/date-fns/setDefaultOptions.mjs"() {
  }
});

// node_modules/date-fns/setHours.mjs
var init_setHours = __esm({
  "node_modules/date-fns/setHours.mjs"() {
  }
});

// node_modules/date-fns/setMilliseconds.mjs
var init_setMilliseconds = __esm({
  "node_modules/date-fns/setMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/setMinutes.mjs
var init_setMinutes = __esm({
  "node_modules/date-fns/setMinutes.mjs"() {
  }
});

// node_modules/date-fns/setQuarter.mjs
var init_setQuarter = __esm({
  "node_modules/date-fns/setQuarter.mjs"() {
  }
});

// node_modules/date-fns/setSeconds.mjs
var init_setSeconds = __esm({
  "node_modules/date-fns/setSeconds.mjs"() {
  }
});

// node_modules/date-fns/setWeekYear.mjs
var init_setWeekYear = __esm({
  "node_modules/date-fns/setWeekYear.mjs"() {
  }
});

// node_modules/date-fns/setYear.mjs
var init_setYear = __esm({
  "node_modules/date-fns/setYear.mjs"() {
  }
});

// node_modules/date-fns/startOfDecade.mjs
var init_startOfDecade = __esm({
  "node_modules/date-fns/startOfDecade.mjs"() {
  }
});

// node_modules/date-fns/startOfToday.mjs
var init_startOfToday = __esm({
  "node_modules/date-fns/startOfToday.mjs"() {
  }
});

// node_modules/date-fns/startOfTomorrow.mjs
var init_startOfTomorrow = __esm({
  "node_modules/date-fns/startOfTomorrow.mjs"() {
  }
});

// node_modules/date-fns/startOfYesterday.mjs
var init_startOfYesterday = __esm({
  "node_modules/date-fns/startOfYesterday.mjs"() {
  }
});

// node_modules/date-fns/subMonths.mjs
var init_subMonths = __esm({
  "node_modules/date-fns/subMonths.mjs"() {
  }
});

// node_modules/date-fns/sub.mjs
var init_sub = __esm({
  "node_modules/date-fns/sub.mjs"() {
  }
});

// node_modules/date-fns/subBusinessDays.mjs
var init_subBusinessDays = __esm({
  "node_modules/date-fns/subBusinessDays.mjs"() {
  }
});

// node_modules/date-fns/subHours.mjs
var init_subHours = __esm({
  "node_modules/date-fns/subHours.mjs"() {
  }
});

// node_modules/date-fns/subMilliseconds.mjs
var init_subMilliseconds = __esm({
  "node_modules/date-fns/subMilliseconds.mjs"() {
  }
});

// node_modules/date-fns/subMinutes.mjs
var init_subMinutes = __esm({
  "node_modules/date-fns/subMinutes.mjs"() {
  }
});

// node_modules/date-fns/subQuarters.mjs
var init_subQuarters = __esm({
  "node_modules/date-fns/subQuarters.mjs"() {
  }
});

// node_modules/date-fns/subSeconds.mjs
var init_subSeconds = __esm({
  "node_modules/date-fns/subSeconds.mjs"() {
  }
});

// node_modules/date-fns/subWeeks.mjs
var init_subWeeks = __esm({
  "node_modules/date-fns/subWeeks.mjs"() {
  }
});

// node_modules/date-fns/subYears.mjs
var init_subYears = __esm({
  "node_modules/date-fns/subYears.mjs"() {
  }
});

// node_modules/date-fns/weeksToDays.mjs
var init_weeksToDays = __esm({
  "node_modules/date-fns/weeksToDays.mjs"() {
  }
});

// node_modules/date-fns/yearsToDays.mjs
var init_yearsToDays = __esm({
  "node_modules/date-fns/yearsToDays.mjs"() {
  }
});

// node_modules/date-fns/yearsToMonths.mjs
var init_yearsToMonths = __esm({
  "node_modules/date-fns/yearsToMonths.mjs"() {
  }
});

// node_modules/date-fns/yearsToQuarters.mjs
var init_yearsToQuarters = __esm({
  "node_modules/date-fns/yearsToQuarters.mjs"() {
  }
});

// node_modules/date-fns/index.mjs
var init_date_fns = __esm({
  "node_modules/date-fns/index.mjs"() {
    init_add();
    init_addBusinessDays();
    init_addDays();
    init_addHours();
    init_addISOWeekYears();
    init_addMilliseconds();
    init_addMinutes();
    init_addMonths();
    init_addQuarters();
    init_addSeconds();
    init_addWeeks();
    init_addYears();
    init_areIntervalsOverlapping();
    init_clamp();
    init_closestIndexTo();
    init_closestTo();
    init_compareAsc();
    init_compareDesc();
    init_constructFrom();
    init_constructNow();
    init_daysToWeeks();
    init_differenceInBusinessDays();
    init_differenceInCalendarDays();
    init_differenceInCalendarISOWeekYears();
    init_differenceInCalendarISOWeeks();
    init_differenceInCalendarMonths();
    init_differenceInCalendarQuarters();
    init_differenceInCalendarWeeks();
    init_differenceInCalendarYears();
    init_differenceInDays();
    init_differenceInHours();
    init_differenceInISOWeekYears();
    init_differenceInMilliseconds();
    init_differenceInMinutes();
    init_differenceInMonths();
    init_differenceInQuarters();
    init_differenceInSeconds();
    init_differenceInWeeks();
    init_differenceInYears();
    init_eachDayOfInterval();
    init_eachHourOfInterval();
    init_eachMinuteOfInterval();
    init_eachMonthOfInterval();
    init_eachQuarterOfInterval();
    init_eachWeekOfInterval();
    init_eachWeekendOfInterval();
    init_eachWeekendOfMonth();
    init_eachWeekendOfYear();
    init_eachYearOfInterval();
    init_endOfDay();
    init_endOfDecade();
    init_endOfHour();
    init_endOfISOWeek();
    init_endOfISOWeekYear();
    init_endOfMinute();
    init_endOfMonth();
    init_endOfQuarter();
    init_endOfSecond();
    init_endOfToday();
    init_endOfTomorrow();
    init_endOfWeek();
    init_endOfYear();
    init_endOfYesterday();
    init_format();
    init_formatDistance2();
    init_formatDistanceStrict();
    init_formatDistanceToNow();
    init_formatDistanceToNowStrict();
    init_formatDuration();
    init_formatISO();
    init_formatISO9075();
    init_formatISODuration();
    init_formatRFC3339();
    init_formatRFC7231();
    init_formatRelative2();
    init_fromUnixTime();
    init_getDate();
    init_getDay();
    init_getDayOfYear();
    init_getDaysInMonth();
    init_getDaysInYear();
    init_getDecade();
    init_getDefaultOptions();
    init_getHours();
    init_getISODay();
    init_getISOWeek();
    init_getISOWeekYear();
    init_getISOWeeksInYear();
    init_getMilliseconds();
    init_getMinutes();
    init_getMonth();
    init_getOverlappingDaysInIntervals();
    init_getQuarter();
    init_getSeconds();
    init_getTime();
    init_getUnixTime();
    init_getWeek();
    init_getWeekOfMonth();
    init_getWeekYear();
    init_getWeeksInMonth();
    init_getYear();
    init_hoursToMilliseconds();
    init_hoursToMinutes();
    init_hoursToSeconds();
    init_interval();
    init_intervalToDuration();
    init_intlFormat();
    init_intlFormatDistance();
    init_isAfter();
    init_isBefore();
    init_isDate();
    init_isEqual();
    init_isExists();
    init_isFirstDayOfMonth();
    init_isFriday();
    init_isFuture();
    init_isLastDayOfMonth();
    init_isLeapYear();
    init_isMatch();
    init_isMonday();
    init_isPast();
    init_isSameDay();
    init_isSameHour();
    init_isSameISOWeek();
    init_isSameISOWeekYear();
    init_isSameMinute();
    init_isSameMonth();
    init_isSameQuarter();
    init_isSameSecond();
    init_isSameWeek();
    init_isSameYear();
    init_isSaturday();
    init_isSunday();
    init_isThisHour();
    init_isThisISOWeek();
    init_isThisMinute();
    init_isThisMonth();
    init_isThisQuarter();
    init_isThisSecond();
    init_isThisWeek();
    init_isThisYear();
    init_isThursday();
    init_isToday();
    init_isTomorrow();
    init_isTuesday();
    init_isValid();
    init_isWednesday();
    init_isWeekend();
    init_isWithinInterval();
    init_isYesterday();
    init_lastDayOfDecade();
    init_lastDayOfISOWeek();
    init_lastDayOfISOWeekYear();
    init_lastDayOfMonth();
    init_lastDayOfQuarter();
    init_lastDayOfWeek();
    init_lastDayOfYear();
    init_lightFormat();
    init_max();
    init_milliseconds();
    init_millisecondsToHours();
    init_millisecondsToMinutes();
    init_millisecondsToSeconds();
    init_min();
    init_minutesToHours();
    init_minutesToMilliseconds();
    init_minutesToSeconds();
    init_monthsToQuarters();
    init_monthsToYears();
    init_nextDay();
    init_nextFriday();
    init_nextMonday();
    init_nextSaturday();
    init_nextSunday();
    init_nextThursday();
    init_nextTuesday();
    init_nextWednesday();
    init_parse();
    init_parseISO();
    init_parseJSON();
    init_previousDay();
    init_previousFriday();
    init_previousMonday();
    init_previousSaturday();
    init_previousSunday();
    init_previousThursday();
    init_previousTuesday();
    init_previousWednesday();
    init_quartersToMonths();
    init_quartersToYears();
    init_roundToNearestHours();
    init_roundToNearestMinutes();
    init_secondsToHours();
    init_secondsToMilliseconds();
    init_secondsToMinutes();
    init_set();
    init_setDate();
    init_setDay();
    init_setDayOfYear();
    init_setDefaultOptions();
    init_setHours();
    init_setISODay();
    init_setISOWeek();
    init_setISOWeekYear();
    init_setMilliseconds();
    init_setMinutes();
    init_setMonth();
    init_setQuarter();
    init_setSeconds();
    init_setWeek();
    init_setWeekYear();
    init_setYear();
    init_startOfDay();
    init_startOfDecade();
    init_startOfHour();
    init_startOfISOWeek();
    init_startOfISOWeekYear();
    init_startOfMinute();
    init_startOfMonth();
    init_startOfQuarter();
    init_startOfSecond();
    init_startOfToday();
    init_startOfTomorrow();
    init_startOfWeek();
    init_startOfWeekYear();
    init_startOfYear();
    init_startOfYesterday();
    init_sub();
    init_subBusinessDays();
    init_subDays();
    init_subHours();
    init_subISOWeekYears();
    init_subMilliseconds();
    init_subMinutes();
    init_subMonths();
    init_subQuarters();
    init_subSeconds();
    init_subWeeks();
    init_subYears();
    init_toDate();
    init_transpose();
    init_weeksToDays();
    init_yearsToDays();
    init_yearsToMonths();
    init_yearsToQuarters();
  }
});

// src/lib/prisma.ts
var prisma_exports = {};
__export(prisma_exports, {
  default: () => prisma_default
});
var import_client, prismaClientSingleton, prisma, prisma_default;
var init_prisma = __esm({
  "src/lib/prisma.ts"() {
    "use strict";
    import_client = require("@prisma/client");
    prismaClientSingleton = () => {
      return new import_client.PrismaClient();
    };
    prisma = globalThis.prisma ?? prismaClientSingleton();
    prisma_default = prisma;
    if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
  }
});

// src/lib/audit-log.ts
function newAuditCorrelationId() {
  try {
    return (0, import_crypto.randomUUID)();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}
async function createAuditLog(data) {
  "use server";
  try {
    await prisma_default.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        details: data.details ? JSON.stringify(data.details) : null
      }
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}
var import_crypto;
var init_audit_log = __esm({
  "src/lib/audit-log.ts"() {
    "use strict";
    init_prisma();
    import_crypto = require("crypto");
  }
});

// src/actions/provider-distribution.ts
var provider_distribution_exports = {};
__export(provider_distribution_exports, {
  runProviderDistributionOnce: () => runProviderDistributionOnce
});
function roundCurrency(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
function isUpstreamSuccess(payload) {
  const status = String(payload?.status ?? "").toUpperCase();
  return status === "SUCCESS" || status === "SUCCESSFUL" || status === "OK";
}
function getUpstreamConfig() {
  const url = process.env.EXTERNAL_DISTRIBUTION_URL ?? "http://192.168.100.56:8280/nibtera-loan/distribution";
  const user = process.env.EXTERNAL_API_USERNAME ?? "nibLoan";
  const pass = process.env.EXTERNAL_API_PASSWORD ?? "123456";
  const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  return { url, auth };
}
async function runProviderDistributionOnce(input) {
  const distributionDate = startOfDay(input?.distributionDate ?? subDays(/* @__PURE__ */ new Date(), 1));
  const distributionDateStr = format(distributionDate, "yyyy-MM-dd");
  const runId = newAuditCorrelationId();
  logger.info(`Provider distribution run started for date=${distributionDateStr}`);
  try {
    const providers = await prisma_default.loanProvider.findMany({
      include: { ledgerAccounts: true }
    });
    await createAuditLog({
      actorId: "system",
      action: "PROVIDER_DISTRIBUTION_RUN_STARTED",
      entity: "Service",
      entityId: "provider-distribution",
      details: {
        runId,
        distributionDate: distributionDateStr,
        providerCount: providers.length
      }
    });
    logger.info(`Found ${providers.length} providers for distribution run`);
    const upstream = getUpstreamConfig();
    let processedProviders = 0;
    let skippedProviders = 0;
    let alreadyDistributed = 0;
    let errors = 0;
    for (const provider of providers) {
      try {
        logger.info(`Processing provider ${provider.id} (${provider.name})`);
        const interestIncome = provider.ledgerAccounts.find((a) => a.category === "Interest" && a.type === "Income");
        const serviceFeeIncome = provider.ledgerAccounts.find((a) => a.category === "ServiceFee" && a.type === "Income");
        const penaltyIncome = provider.ledgerAccounts.find((a) => a.category === "Penalty" && a.type === "Income");
        const taxReceived = provider.ledgerAccounts.find((a) => a.category === "Tax" && a.type === "Received");
        const breakdown = {
          interestAmount: roundCurrency(interestIncome?.balance ?? 0),
          serviceFeeAmount: roundCurrency(serviceFeeIncome?.balance ?? 0),
          penaltyAmount: roundCurrency(penaltyIncome?.balance ?? 0),
          taxAmount: roundCurrency(taxReceived?.balance ?? 0)
        };
        const total = roundCurrency(
          breakdown.interestAmount + breakdown.serviceFeeAmount + breakdown.penaltyAmount + breakdown.taxAmount
        );
        logger.info(
          `Provider ${provider.id} distributable balances (income/tax): interest=${breakdown.interestAmount} serviceFee=${breakdown.serviceFeeAmount} penalty=${breakdown.penaltyAmount} tax=${breakdown.taxAmount} total=${total}`
        );
        if (total <= 0) {
          skippedProviders++;
          logger.info(`Skipping provider ${provider.id}: nothing to distribute (total=0)`);
          continue;
        }
        const existing = await prisma_default.providerDistribution.findUnique({
          where: {
            providerId_distributionDate: {
              providerId: provider.id,
              distributionDate
            }
          },
          select: { id: true }
        });
        if (existing) {
          alreadyDistributed++;
          logger.warn(`Provider ${provider.id} already has a distribution for ${distributionDateStr}, skipping`);
          continue;
        }
        const externalProviderId = provider.accountNumber ?? provider.id;
        const payload = {
          providerId: externalProviderId,
          distributionDate: distributionDateStr,
          breakdown
        };
        logger.info(`Posting distribution to upstream for provider ${provider.id} -> externalId=${externalProviderId}`);
        const res = await fetch(upstream.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: upstream.auth
          },
          body: JSON.stringify(payload)
        });
        const responseJson = await res.json().catch(() => null);
        if (!res.ok || !isUpstreamSuccess(responseJson)) {
          const details = {
            runId,
            providerId: provider.id,
            externalProviderId,
            distributionDate: distributionDateStr,
            upstreamStatus: res.status,
            upstreamBody: responseJson
          };
          logger.error(`Upstream failed for provider ${provider.id}: status=${res.status} body=${JSON.stringify(responseJson)}`);
          await createAuditLog({
            actorId: "system",
            action: "PROVIDER_DISTRIBUTION_FAILED",
            entity: "LoanProvider",
            entityId: provider.id,
            details
          });
          errors++;
          continue;
        }
        const distributionReference = String(responseJson?.distributionReference ?? "");
        await prisma_default.$transaction(async (tx) => {
          await tx.providerDistribution.create({
            data: {
              providerId: provider.id,
              externalProviderId,
              distributionDate,
              interestAmount: breakdown.interestAmount,
              serviceFeeAmount: breakdown.serviceFeeAmount,
              penaltyAmount: breakdown.penaltyAmount,
              taxAmount: breakdown.taxAmount,
              totalDistributedAmount: total,
              distributionReference: distributionReference || null
            }
          });
          const updates = [];
          if (interestIncome) updates.push(tx.ledgerAccount.update({ where: { id: interestIncome.id }, data: { balance: 0 } }));
          if (serviceFeeIncome) updates.push(tx.ledgerAccount.update({ where: { id: serviceFeeIncome.id }, data: { balance: 0 } }));
          if (penaltyIncome) updates.push(tx.ledgerAccount.update({ where: { id: penaltyIncome.id }, data: { balance: 0 } }));
          if (taxReceived) updates.push(tx.ledgerAccount.update({ where: { id: taxReceived.id }, data: { balance: 0 } }));
          await Promise.all(updates);
        });
        await createAuditLog({
          actorId: "system",
          action: "PROVIDER_DISTRIBUTION_SUCCESS",
          entity: "LoanProvider",
          entityId: provider.id,
          details: {
            runId,
            providerId: provider.id,
            externalProviderId,
            distributionDate: distributionDateStr,
            breakdown,
            totalDistributedAmount: total,
            distributionReference: distributionReference || null
          }
        });
        logger.info(`Provider ${provider.id} distribution succeeded total=${total} ref=${distributionReference || "n/a"}`);
        processedProviders++;
      } catch (e) {
        errors++;
        logger.error(`Provider ${provider.id} distribution error: ${String(e?.message ?? e)}`);
        await createAuditLog({
          actorId: "system",
          action: "PROVIDER_DISTRIBUTION_ERROR",
          entity: "LoanProvider",
          entityId: provider.id,
          details: {
            runId,
            providerId: provider.id,
            distributionDate: distributionDateStr,
            error: String(e?.message ?? e)
          }
        });
      }
    }
    const result = {
      distributionDate: distributionDateStr,
      processedProviders,
      skippedProviders,
      alreadyDistributed,
      errors
    };
    await createAuditLog({
      actorId: "system",
      action: "PROVIDER_DISTRIBUTION_RUN_FINISHED",
      entity: "Service",
      entityId: "provider-distribution",
      details: {
        runId,
        ...result
      }
    });
    logger.info(`Provider distribution run finished: ${JSON.stringify(result)}`);
    return result;
  } catch (e) {
    await createAuditLog({
      actorId: "system",
      action: "PROVIDER_DISTRIBUTION_RUN_FAILED",
      entity: "Service",
      entityId: "provider-distribution",
      details: {
        runId,
        distributionDate: distributionDateStr,
        error: String(e?.message ?? e)
      }
    });
    throw e;
  }
}
var init_provider_distribution = __esm({
  "src/actions/provider-distribution.ts"() {
    "use strict";
    "use server";
    init_prisma();
    init_audit_log();
    init_date_fns();
    init_logger();
  }
});

// src/lib/interest-accrual.ts
var roundCurrency2, normalizePayments, simulateDailyInterestAccrual, calculateInterestWithPayments, calculateInterestWithPaymentsDetailed;
var init_interest_accrual = __esm({
  "src/lib/interest-accrual.ts"() {
    "use strict";
    init_date_fns();
    roundCurrency2 = (amount) => {
      return Math.round((amount + Number.EPSILON) * 100) / 100;
    };
    normalizePayments = (payments) => {
      if (!Array.isArray(payments)) return [];
      return payments.map((p) => ({
        amount: typeof p?.amount === "string" ? Number(p.amount) : Number(p?.amount),
        date: new Date(p?.date)
      })).filter((p) => Number.isFinite(p.amount) && p.amount > 0 && !Number.isNaN(p.date.getTime()));
    };
    simulateDailyInterestAccrual = (params) => {
      const { principal, loanStartDate, interestEndDate, dailyFeeRule, serviceFee, payments } = params;
      const daysForInterest = differenceInDays(interestEndDate, loanStartDate);
      if (daysForInterest <= 0) return { accruals: [], interestPaid: 0, serviceFeePaid: 0, principalPaid: 0 };
      const paymentsByDay = /* @__PURE__ */ new Map();
      for (const payment of payments) {
        const day2 = startOfDay(payment.date);
        if (day2 < loanStartDate || day2 > interestEndDate) continue;
        paymentsByDay.set(day2.getTime(), (paymentsByDay.get(day2.getTime()) ?? 0) + payment.amount);
      }
      if (dailyFeeRule.type === "fixed") {
        const daily = roundCurrency2(dailyFeeRule.value);
        const accruals2 = [];
        let serviceFeePaid2 = 0;
        let interestPaid2 = 0;
        let principalPaid2 = 0;
        let interestAccrued2 = 0;
        for (let dayIndex = 0; dayIndex < daysForInterest; dayIndex++) {
          const day2 = addDays(loanStartDate, dayIndex);
          let paymentAmount = paymentsByDay.get(day2.getTime()) ?? 0;
          if (paymentAmount > 0) {
            const serviceFeeDue = Math.max(0, serviceFee - serviceFeePaid2);
            const serviceFeeToPay = Math.min(paymentAmount, serviceFeeDue);
            serviceFeePaid2 += serviceFeeToPay;
            paymentAmount -= serviceFeeToPay;
            const interestDue = Math.max(0, interestAccrued2 - interestPaid2);
            const interestToPay = Math.min(paymentAmount, interestDue);
            interestPaid2 += interestToPay;
            paymentAmount -= interestToPay;
            const principalDue = Math.max(0, principal - principalPaid2);
            const principalToPay = Math.min(paymentAmount, principalDue);
            principalPaid2 += principalToPay;
            paymentAmount -= principalToPay;
          }
          interestAccrued2 += daily;
          accruals2.push({ date: day2, interest: daily });
        }
        let endDayPayment2 = paymentsByDay.get(startOfDay(interestEndDate).getTime()) ?? 0;
        if (endDayPayment2 > 0) {
          const serviceFeeDue = Math.max(0, serviceFee - serviceFeePaid2);
          const serviceFeeToPay = Math.min(endDayPayment2, serviceFeeDue);
          serviceFeePaid2 += serviceFeeToPay;
          endDayPayment2 -= serviceFeeToPay;
          const interestDue = Math.max(0, interestAccrued2 - interestPaid2);
          const interestToPay = Math.min(endDayPayment2, interestDue);
          interestPaid2 += interestToPay;
          endDayPayment2 -= interestToPay;
          const principalDue = Math.max(0, principal - principalPaid2);
          const principalToPay = Math.min(endDayPayment2, principalDue);
          principalPaid2 += principalToPay;
        }
        return { accruals: accruals2, interestPaid: interestPaid2, serviceFeePaid: serviceFeePaid2, principalPaid: principalPaid2 };
      }
      const dailyRate = dailyFeeRule.value / 100;
      if (dailyRate <= 0) return { accruals: [], interestPaid: 0, serviceFeePaid: 0, principalPaid: 0 };
      let serviceFeePaid = 0;
      let interestPaid = 0;
      let principalPaid = 0;
      let interestAccrued = 0;
      let principalOutstanding = principal;
      let compoundBase = principal;
      const isCompound = dailyFeeRule.calculationBase === "compound";
      const accruals = [];
      for (let dayIndex = 0; dayIndex < daysForInterest; dayIndex++) {
        const day2 = addDays(loanStartDate, dayIndex);
        let paymentAmount = paymentsByDay.get(day2.getTime()) ?? 0;
        if (paymentAmount > 0) {
          const serviceFeeDue = Math.max(0, serviceFee - serviceFeePaid);
          const serviceFeeToPay = Math.min(paymentAmount, serviceFeeDue);
          serviceFeePaid += serviceFeeToPay;
          paymentAmount -= serviceFeeToPay;
          const interestDue = Math.max(0, interestAccrued - interestPaid);
          const interestToPay = Math.min(paymentAmount, interestDue);
          interestPaid += interestToPay;
          paymentAmount -= interestToPay;
          const principalDue = Math.max(0, principal - principalPaid);
          const principalToPay = Math.min(paymentAmount, principalDue);
          principalPaid += principalToPay;
          paymentAmount -= principalToPay;
          if (isCompound) {
            compoundBase = Math.max(0, compoundBase - interestToPay - principalToPay);
          } else {
            principalOutstanding = Math.max(0, principalOutstanding - principalToPay);
          }
        }
        let dailyInterest = 0;
        if (isCompound) {
          dailyInterest = roundCurrency2(compoundBase * dailyRate);
          interestAccrued += dailyInterest;
          compoundBase += dailyInterest;
        } else {
          dailyInterest = roundCurrency2(principalOutstanding * dailyRate);
          interestAccrued += dailyInterest;
        }
        accruals.push({ date: day2, interest: dailyInterest });
      }
      let endDayPayment = paymentsByDay.get(startOfDay(interestEndDate).getTime()) ?? 0;
      if (endDayPayment > 0) {
        const serviceFeeDue = Math.max(0, serviceFee - serviceFeePaid);
        const serviceFeeToPay = Math.min(endDayPayment, serviceFeeDue);
        serviceFeePaid += serviceFeeToPay;
        endDayPayment -= serviceFeeToPay;
        const interestDue = Math.max(0, interestAccrued - interestPaid);
        const interestToPay = Math.min(endDayPayment, interestDue);
        interestPaid += interestToPay;
        endDayPayment -= interestToPay;
        const principalDue = Math.max(0, principal - principalPaid);
        const principalToPay = Math.min(endDayPayment, principalDue);
        principalPaid += principalToPay;
        if (isCompound) {
          compoundBase = Math.max(0, compoundBase - interestToPay - principalToPay);
        } else {
          principalOutstanding = Math.max(0, principalOutstanding - principalToPay);
        }
      }
      return { accruals, interestPaid, serviceFeePaid, principalPaid };
    };
    calculateInterestWithPayments = (params) => {
      const result = calculateInterestWithPaymentsDetailed(params);
      return result.totalInterest;
    };
    calculateInterestWithPaymentsDetailed = (params) => {
      const { dailyFeeRule } = params;
      const result = simulateDailyInterestAccrual(params);
      if (result.accruals.length === 0) {
        return { totalInterest: 0, interestPaid: 0, serviceFeePaid: 0, principalPaid: 0 };
      }
      const total = result.accruals.reduce((sum, a) => sum + a.interest, 0);
      if (dailyFeeRule.type === "fixed") {
        return {
          totalInterest: roundCurrency2(total),
          interestPaid: roundCurrency2(result.interestPaid),
          serviceFeePaid: roundCurrency2(result.serviceFeePaid),
          principalPaid: roundCurrency2(result.principalPaid)
        };
      }
      return {
        totalInterest: roundCurrency2(total),
        interestPaid: roundCurrency2(result.interestPaid),
        serviceFeePaid: roundCurrency2(result.serviceFeePaid),
        principalPaid: roundCurrency2(result.principalPaid)
      };
    };
  }
});

// src/actions/interest-accrual.ts
var interest_accrual_exports = {};
__export(interest_accrual_exports, {
  runDailyInterestAccrualOnce: () => runDailyInterestAccrualOnce
});
async function runDailyInterestAccrualOnce(asOf = /* @__PURE__ */ new Date()) {
  const accrualThroughDate = startOfDay(asOf);
  const runId = newAuditCorrelationId();
  try {
    const activeTaxConfigs = await prisma_default.tax.findMany({ where: { status: "ACTIVE" } });
    const loans = await prisma_default.loan.findMany({
      where: {
        repaymentStatus: "Unpaid",
        disbursedDate: { lt: accrualThroughDate }
      },
      include: {
        payments: { orderBy: { date: "asc" } },
        product: {
          include: {
            provider: { include: { ledgerAccounts: true } }
          }
        }
      }
    });
    await createAuditLog({
      actorId: "system",
      action: "INTEREST_ACCRUAL_RUN_STARTED",
      entity: "Service",
      entityId: "interest-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        candidateLoans: loans.length
      }
    });
    let processedLoans = 0;
    let skippedLoans = 0;
    let totalAccrued = 0;
    for (const loan of loans) {
      const loanStartDate = startOfDay(new Date(loan.disbursedDate));
      const dueDate = startOfDay(new Date(loan.dueDate));
      const interestEndDate = accrualThroughDate > dueDate ? dueDate : accrualThroughDate;
      const lastThroughRaw = loan.interestAccruedThroughDate;
      const lastThrough = lastThroughRaw ? startOfDay(new Date(lastThroughRaw)) : loanStartDate;
      if (interestEndDate <= lastThrough) {
        skippedLoans++;
        continue;
      }
      const dailyFeeRule = safeJsonParse(loan.product.dailyFee, void 0);
      if (!loan.product.dailyFeeEnabled || !dailyFeeRule || !dailyFeeRule.value || Number(dailyFeeRule.value) <= 0) {
        await prisma_default.loan.update({
          where: { id: loan.id },
          data: { interestAccruedThroughDate: interestEndDate }
        });
        skippedLoans++;
        continue;
      }
      const feeValue = typeof dailyFeeRule.value === "string" ? Number(dailyFeeRule.value) : Number(dailyFeeRule.value);
      const payments = normalizePayments(loan.payments);
      const totalInterestToDate = calculateInterestWithPayments({
        principal: loan.loanAmount,
        loanStartDate,
        interestEndDate,
        dailyFeeRule: {
          type: dailyFeeRule.type,
          value: feeValue,
          calculationBase: dailyFeeRule.calculationBase
        },
        serviceFee: loan.serviceFee,
        payments
      });
      const alreadyAccrued = Number(loan.interestAccruedAmount ?? 0);
      const delta = totalInterestToDate - alreadyAccrued;
      if (delta <= 1e-6) {
        await prisma_default.loan.update({
          where: { id: loan.id },
          data: { interestAccruedThroughDate: interestEndDate }
        });
        skippedLoans++;
        continue;
      }
      const provider = loan.product.provider;
      const interestReceivable = provider.ledgerAccounts.find((a) => a.category === "Interest" && a.type === "Receivable");
      if (!interestReceivable) {
        throw new Error(`Interest receivable ledger account not configured for provider ${provider.id}`);
      }
      const taxReceivable = provider.ledgerAccounts.find((a) => a.category === "Tax" && a.type === "Receivable");
      const taxDelta = (() => {
        if (!activeTaxConfigs || activeTaxConfigs.length === 0) return 0;
        let totalTax = 0;
        for (const taxConfig of activeTaxConfigs) {
          const taxRate = Number(taxConfig?.rate ?? 0);
          if (!taxRate || taxRate <= 0) continue;
          let appliedTo = [];
          try {
            appliedTo = JSON.parse(String(taxConfig?.appliedTo ?? "[]"));
          } catch {
            appliedTo = [];
          }
          if (Array.isArray(appliedTo) && appliedTo.includes("interest")) {
            totalTax += delta * (taxRate / 100);
          }
        }
        return totalTax;
      })();
      await prisma_default.$transaction(async (tx) => {
        const journalEntry = await tx.journalEntry.create({
          data: {
            providerId: provider.id,
            loanId: loan.id,
            date: interestEndDate,
            description: `Daily interest accrual through ${interestEndDate.toISOString().slice(0, 10)} for loan ${loan.id}`
          }
        });
        const ledgerCreates = [
          { journalEntryId: journalEntry.id, ledgerAccountId: interestReceivable.id, type: "Debit", amount: delta }
        ];
        const updates = [
          tx.ledgerAccount.update({ where: { id: interestReceivable.id }, data: { balance: { increment: delta } } })
        ];
        if (taxDelta > 1e-6) {
          if (!taxReceivable) {
            throw new Error(`Tax receivable ledger account not configured for provider ${provider.id}`);
          }
          ledgerCreates.push({ journalEntryId: journalEntry.id, ledgerAccountId: taxReceivable.id, type: "Debit", amount: taxDelta });
          updates.push(tx.ledgerAccount.update({ where: { id: taxReceivable.id }, data: { balance: { increment: taxDelta } } }));
        }
        await tx.ledgerEntry.createMany({ data: ledgerCreates });
        await Promise.all(updates);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            interestAccruedAmount: alreadyAccrued + delta,
            interestAccruedThroughDate: interestEndDate
          }
        });
      });
      processedLoans++;
      totalAccrued += delta;
    }
    const result = {
      success: true,
      accrualThroughDate,
      processedLoans,
      totalAccrued,
      skippedLoans
    };
    await createAuditLog({
      actorId: "system",
      action: "INTEREST_ACCRUAL_RUN_FINISHED",
      entity: "Service",
      entityId: "interest-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        processedLoans,
        skippedLoans,
        totalAccrued
      }
    });
    return result;
  } catch (e) {
    await createAuditLog({
      actorId: "system",
      action: "INTEREST_ACCRUAL_RUN_FAILED",
      entity: "Service",
      entityId: "interest-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        error: String(e?.message ?? e)
      }
    });
    throw e;
  }
}
var safeJsonParse;
var init_interest_accrual2 = __esm({
  "src/actions/interest-accrual.ts"() {
    "use strict";
    "use server";
    init_prisma();
    init_date_fns();
    init_interest_accrual();
    init_audit_log();
    safeJsonParse = (field, defaultValue) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch {
          return defaultValue;
        }
      }
      return field ?? defaultValue;
    };
  }
});

// src/lib/penalty-accrual.ts
var normalizeInstallmentPayments, toNumberOrDefault, ruleToTier, calculatePenaltyWithPayments;
var init_penalty_accrual = __esm({
  "src/lib/penalty-accrual.ts"() {
    "use strict";
    init_date_fns();
    init_interest_accrual();
    normalizeInstallmentPayments = (payments) => {
      if (!Array.isArray(payments)) return [];
      return payments.map((p) => ({
        amount: typeof p?.amount === "string" ? Number(p.amount) : Number(p?.amount),
        date: new Date(p?.date),
        installmentId: p?.installmentId ?? null
      })).filter((p) => Number.isFinite(p.amount) && p.amount > 0 && !Number.isNaN(p.date.getTime()));
    };
    toNumberOrDefault = (value, defaultValue) => {
      if (value === "" || value === null || value === void 0) return defaultValue;
      const n = Number(value);
      return Number.isFinite(n) ? n : defaultValue;
    };
    ruleToTier = (rule) => {
      const fromDay = toNumberOrDefault(rule.fromDay, 1);
      const toDayRaw = rule.toDay === "" || rule.toDay === null ? Infinity : toNumberOrDefault(rule.toDay, Infinity);
      const toDay = Number.isFinite(toDayRaw) ? toDayRaw : Infinity;
      const value = toNumberOrDefault(rule.value, 0);
      const frequency = rule.frequency;
      const type = rule.type;
      return { fromDay, toDay, value, frequency, type };
    };
    calculatePenaltyWithPayments = (params) => {
      const {
        penaltyStartDate,
        penaltyEndDate,
        penaltyRules,
        penaltyPerInstallment,
        principal,
        runningBalanceForCompound,
        installments = [],
        payments = []
      } = params;
      const start = startOfDay(penaltyStartDate);
      const end = startOfDay(penaltyEndDate);
      const days = differenceInDays(end, start);
      if (days <= 0) return { totalPenalty: 0, installmentPenaltyById: penaltyPerInstallment ? {} : void 0 };
      const rules = (penaltyRules || []).map(ruleToTier).filter((r) => r.fromDay > 0 && r.value > 0);
      if (rules.length === 0) return { totalPenalty: 0, installmentPenaltyById: penaltyPerInstallment ? {} : void 0 };
      if (!penaltyPerInstallment) {
        let totalPenalty2 = 0;
        let compoundBase = Math.max(0, Number(runningBalanceForCompound) || 0);
        for (let dayIndex = 0; dayIndex < days; dayIndex++) {
          const daysOverdue = dayIndex + 1;
          for (const rule of rules) {
            if (daysOverdue < rule.fromDay) continue;
            if (daysOverdue > rule.toDay) continue;
            const isOneTime = rule.frequency === "one-time";
            if (isOneTime && daysOverdue !== rule.fromDay) continue;
            let dailyPenalty = 0;
            if (rule.type === "fixed") {
              dailyPenalty = roundCurrency2(rule.value);
            } else if (rule.type === "percentageOfPrincipal") {
              dailyPenalty = roundCurrency2(Math.max(0, principal) * (rule.value / 100));
            } else if (rule.type === "percentageOfCompound") {
              dailyPenalty = roundCurrency2(Math.max(0, compoundBase) * (rule.value / 100));
            }
            if (dailyPenalty <= 0) continue;
            totalPenalty2 += dailyPenalty;
            if (rule.type === "percentageOfCompound" && !isOneTime) {
              compoundBase += dailyPenalty;
            }
          }
        }
        return { totalPenalty: roundCurrency2(totalPenalty2) };
      }
      const byId = {};
      const paymentsByDayAndInstallment = /* @__PURE__ */ new Map();
      for (const p of payments) {
        if (!p.installmentId) continue;
        const day2 = startOfDay(p.date);
        if (day2 < start) continue;
        if (day2 >= end) continue;
        const key2 = `${day2.getTime()}|${p.installmentId}`;
        paymentsByDayAndInstallment.set(key2, (paymentsByDayAndInstallment.get(key2) ?? 0) + p.amount);
      }
      for (const inst of installments) {
        const instDue = startOfDay(new Date(inst.dueDate));
        if (end <= instDue) {
          byId[inst.id] = 0;
          continue;
        }
        const instStart = instDue;
        const instDays = differenceInDays(end, instStart);
        if (instDays <= 0) {
          byId[inst.id] = 0;
          continue;
        }
        let paidSoFar = 0;
        let principalOutstanding = Math.max(0, Number(inst.amount) || 0);
        let compoundBase = principalOutstanding;
        let instPenalty = 0;
        for (let dayIndex = 0; dayIndex < instDays; dayIndex++) {
          const day2 = addDays(instStart, dayIndex);
          const paidToday = paymentsByDayAndInstallment.get(`${day2.getTime()}|${inst.id}`) ?? 0;
          if (paidToday > 0) {
            paidSoFar += paidToday;
            const principalToPay = Math.min(paidToday, principalOutstanding);
            principalOutstanding = Math.max(0, principalOutstanding - principalToPay);
            compoundBase = Math.max(0, compoundBase - principalToPay);
          }
          if (principalOutstanding <= 0) {
            break;
          }
          const daysOverdue = dayIndex + 1;
          for (const rule of rules) {
            if (daysOverdue < rule.fromDay) continue;
            if (daysOverdue > rule.toDay) continue;
            const isOneTime = rule.frequency === "one-time";
            if (isOneTime && daysOverdue !== rule.fromDay) continue;
            let dailyPenalty = 0;
            if (rule.type === "fixed") {
              dailyPenalty = roundCurrency2(rule.value);
            } else if (rule.type === "percentageOfPrincipal") {
              dailyPenalty = roundCurrency2(principalOutstanding * (rule.value / 100));
            } else if (rule.type === "percentageOfCompound") {
              dailyPenalty = roundCurrency2(compoundBase * (rule.value / 100));
            }
            if (dailyPenalty <= 0) continue;
            instPenalty += dailyPenalty;
            if (rule.type === "percentageOfCompound" && !isOneTime) {
              compoundBase += dailyPenalty;
            }
          }
        }
        byId[inst.id] = roundCurrency2(instPenalty);
      }
      const totalPenalty = roundCurrency2(Object.values(byId).reduce((sum, v) => sum + v, 0));
      return { totalPenalty, installmentPenaltyById: byId };
    };
  }
});

// src/actions/penalty-accrual.ts
var penalty_accrual_exports = {};
__export(penalty_accrual_exports, {
  runDailyPenaltyAccrualOnce: () => runDailyPenaltyAccrualOnce
});
async function runDailyPenaltyAccrualOnce(asOf = /* @__PURE__ */ new Date()) {
  const accrualThroughDate = startOfDay(asOf);
  const runId = newAuditCorrelationId();
  try {
    const activeTaxConfigs = await prisma_default.tax.findMany({ where: { status: "ACTIVE" } });
    const loans = await prisma_default.loan.findMany({
      where: {
        repaymentStatus: "Unpaid",
        dueDate: { lt: accrualThroughDate }
      },
      include: {
        payments: { orderBy: { date: "asc" } },
        installments: true,
        product: {
          include: {
            provider: { include: { ledgerAccounts: true } }
          }
        }
      }
    });
    await createAuditLog({
      actorId: "system",
      action: "PENALTY_ACCRUAL_RUN_STARTED",
      entity: "Service",
      entityId: "penalty-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        candidateLoans: loans.length
      }
    });
    let processedLoans = 0;
    let skippedLoans = 0;
    let totalAccrued = 0;
    for (const loan of loans) {
      const dueDate = startOfDay(new Date(loan.dueDate));
      const loanStartDate = startOfDay(new Date(loan.disbursedDate));
      const penaltyEndDate = accrualThroughDate;
      const duration = Number(loan.product.duration ?? 0);
      const penaltyStartDate = duration === 0 ? startOfDay(new Date(loan.disbursedDate.getTime() + 864e5)) : dueDate;
      const lastThroughRaw = loan.penaltyAccruedThroughDate;
      const lastThrough = lastThroughRaw ? startOfDay(new Date(lastThroughRaw)) : penaltyStartDate;
      if (penaltyEndDate <= lastThrough) {
        skippedLoans++;
        continue;
      }
      const penaltyRules = safeJsonParse2(loan.product.penaltyRules, []);
      const penaltyRulesEnabled = Boolean(loan.product.penaltyRulesEnabled);
      if (!penaltyRulesEnabled || !Array.isArray(penaltyRules) || penaltyRules.length === 0) {
        await prisma_default.loan.update({
          where: { id: loan.id },
          data: { penaltyAccruedThroughDate: penaltyEndDate }
        });
        skippedLoans++;
        continue;
      }
      let interestThroughDueDate = 0;
      const dailyFeeRule = safeJsonParse2(loan.product.dailyFee, void 0);
      if (loan.product.dailyFeeEnabled && dailyFeeRule && Number(dailyFeeRule.value) > 0) {
        const feeValue = typeof dailyFeeRule.value === "string" ? Number(dailyFeeRule.value) : Number(dailyFeeRule.value);
        const interestEndDate = dueDate;
        const payments = normalizePayments(loan.payments);
        interestThroughDueDate = calculateInterestWithPayments({
          principal: loan.loanAmount,
          loanStartDate,
          interestEndDate,
          dailyFeeRule: {
            type: dailyFeeRule.type,
            value: feeValue,
            calculationBase: dailyFeeRule.calculationBase
          },
          serviceFee: loan.serviceFee,
          payments
        });
      }
      const runningBalanceForCompound = Number(loan.loanAmount) + Number(loan.serviceFee) + Number(interestThroughDueDate);
      const penaltyPerInstallment = Boolean(loan.product.penaltyPerInstallment);
      const paymentsWithInstallment = normalizeInstallmentPayments(loan.payments);
      const { totalPenalty, installmentPenaltyById } = calculatePenaltyWithPayments({
        penaltyStartDate,
        penaltyEndDate,
        penaltyRules,
        penaltyPerInstallment,
        principal: loan.loanAmount,
        runningBalanceForCompound,
        installments: loan.installments?.map((i) => ({ id: i.id, dueDate: i.dueDate, amount: i.amount })) ?? [],
        payments: paymentsWithInstallment
      });
      const alreadyAccrued = Number(loan.penaltyAccruedAmount ?? 0);
      const delta = totalPenalty - alreadyAccrued;
      if (delta <= 1e-6) {
        await prisma_default.$transaction(async (tx) => {
          await tx.loan.update({
            where: { id: loan.id },
            data: { penaltyAccruedThroughDate: penaltyEndDate, penaltyAmount: totalPenalty }
          });
          if (penaltyPerInstallment && installmentPenaltyById) {
            const updates = Object.entries(installmentPenaltyById).map(
              ([id, amt]) => tx.loanInstallment.update({ where: { id }, data: { penaltyAmount: amt } })
            );
            if (updates.length) await Promise.all(updates);
          }
        });
        skippedLoans++;
        continue;
      }
      const provider = loan.product.provider;
      const penaltyReceivable = provider.ledgerAccounts.find((a) => a.category === "Penalty" && a.type === "Receivable");
      if (!penaltyReceivable) {
        throw new Error(`Penalty receivable ledger account not configured for provider ${provider.id}`);
      }
      const taxReceivable = provider.ledgerAccounts.find((a) => a.category === "Tax" && a.type === "Receivable");
      const taxDelta = (() => {
        if (!activeTaxConfigs || activeTaxConfigs.length === 0) return 0;
        let totalTax = 0;
        for (const taxConfig of activeTaxConfigs) {
          const taxRate = Number(taxConfig?.rate ?? 0);
          if (!taxRate || taxRate <= 0) continue;
          let appliedTo = [];
          try {
            appliedTo = JSON.parse(String(taxConfig?.appliedTo ?? "[]"));
          } catch {
            appliedTo = [];
          }
          if (Array.isArray(appliedTo) && appliedTo.includes("penalty")) {
            totalTax += delta * (taxRate / 100);
          }
        }
        return totalTax;
      })();
      await prisma_default.$transaction(async (tx) => {
        const journalEntry = await tx.journalEntry.create({
          data: {
            providerId: provider.id,
            loanId: loan.id,
            date: penaltyEndDate,
            description: `Daily penalty accrual through ${penaltyEndDate.toISOString().slice(0, 10)} for loan ${loan.id}`
          }
        });
        const ledgerCreates = [
          { journalEntryId: journalEntry.id, ledgerAccountId: penaltyReceivable.id, type: "Debit", amount: delta }
        ];
        const updates = [
          tx.ledgerAccount.update({ where: { id: penaltyReceivable.id }, data: { balance: { increment: delta } } })
        ];
        if (taxDelta > 1e-6) {
          if (!taxReceivable) {
            throw new Error(`Tax receivable ledger account not configured for provider ${provider.id}`);
          }
          ledgerCreates.push({ journalEntryId: journalEntry.id, ledgerAccountId: taxReceivable.id, type: "Debit", amount: taxDelta });
          updates.push(tx.ledgerAccount.update({ where: { id: taxReceivable.id }, data: { balance: { increment: taxDelta } } }));
        }
        await tx.ledgerEntry.createMany({ data: ledgerCreates });
        await Promise.all(updates);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            penaltyAccruedAmount: alreadyAccrued + delta,
            penaltyAccruedThroughDate: penaltyEndDate,
            penaltyAmount: totalPenalty
          }
        });
        if (penaltyPerInstallment && installmentPenaltyById) {
          const updates2 = Object.entries(installmentPenaltyById).map(
            ([id, amt]) => tx.loanInstallment.update({ where: { id }, data: { penaltyAmount: amt } })
          );
          if (updates2.length) await Promise.all(updates2);
        }
      });
      processedLoans++;
      totalAccrued += delta;
    }
    const result = {
      success: true,
      accrualThroughDate,
      processedLoans,
      totalAccrued,
      skippedLoans
    };
    await createAuditLog({
      actorId: "system",
      action: "PENALTY_ACCRUAL_RUN_FINISHED",
      entity: "Service",
      entityId: "penalty-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        processedLoans,
        skippedLoans,
        totalAccrued
      }
    });
    return result;
  } catch (e) {
    await createAuditLog({
      actorId: "system",
      action: "PENALTY_ACCRUAL_RUN_FAILED",
      entity: "Service",
      entityId: "penalty-accrual",
      details: {
        runId,
        accrualThroughDate: accrualThroughDate.toISOString(),
        error: String(e?.message ?? e)
      }
    });
    throw e;
  }
}
var safeJsonParse2;
var init_penalty_accrual2 = __esm({
  "src/actions/penalty-accrual.ts"() {
    "use strict";
    "use server";
    init_prisma();
    init_date_fns();
    init_interest_accrual();
    init_penalty_accrual();
    init_audit_log();
    safeJsonParse2 = (field, defaultValue) => {
      if (typeof field === "string") {
        try {
          return JSON.parse(field);
        } catch {
          return defaultValue;
        }
      }
      return field ?? defaultValue;
    };
  }
});

// src/lib/sms.ts
async function sendSmsOnce(smsUrl, formattedPhone, text) {
  const params = new URLSearchParams();
  params.append("to", formattedPhone);
  params.append("text", text);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    SMS_REQUEST_TIMEOUT_MS
  );
  try {
    const res = await fetch(smsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal
    });
    const body = await res.text().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        retryable: res.status >= 500 || res.status === 429
      };
    }
    return { ok: true, status: res.status, body, retryable: false };
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    return {
      ok: false,
      error: isTimeout ? "Request timeout" : String(err?.message ?? err),
      retryable: true
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
async function sendSms(to, text) {
  const smsUrl = process.env.SMS_URL;
  if (!smsUrl) {
    console.error("[sms] SMS_URL env var not set");
    return { ok: false, error: "SMS_URL env var not set" };
  }
  const formattedPhone = "0" + to.replace(/\D/g, "").slice(-9);
  let lastResult = null;
  for (let attempt = 0; attempt <= SMS_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = SMS_INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      console.info("[sms] retrying", { to, attempt, delay });
    }
    lastResult = await sendSmsOnce(smsUrl, formattedPhone, text);
    if (lastResult.ok) {
      console.info("[sms] sent", {
        to,
        smsUrl,
        status: lastResult.status,
        attempt
      });
      return { ok: true, status: lastResult.status, body: lastResult.body };
    }
    if (!lastResult.retryable) {
      break;
    }
  }
  console.error("[sms] send failed after retries", {
    to,
    smsUrl,
    status: lastResult?.status,
    error: lastResult?.error,
    body: lastResult?.body
  });
  return {
    ok: false,
    status: lastResult?.status,
    body: lastResult?.body,
    error: lastResult?.error || `HTTP ${lastResult?.status}`
  };
}
var SMS_MAX_RETRIES, SMS_INITIAL_RETRY_DELAY_MS, SMS_REQUEST_TIMEOUT_MS, sms_default;
var init_sms = __esm({
  "src/lib/sms.ts"() {
    "use strict";
    SMS_MAX_RETRIES = 2;
    SMS_INITIAL_RETRY_DELAY_MS = 1e3;
    SMS_REQUEST_TIMEOUT_MS = 15e3;
    sms_default = sendSms;
  }
});

// node_modules/jose/dist/node/esm/lib/buffer_utils.js
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
var encoder, decoder, MAX_INT32;
var init_buffer_utils = __esm({
  "node_modules/jose/dist/node/esm/lib/buffer_utils.js"() {
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    MAX_INT32 = 2 ** 32;
  }
});

// node_modules/jose/dist/node/esm/runtime/base64url.js
function normalize(input) {
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  return encoded;
}
var import_node_buffer, encode, decode;
var init_base64url = __esm({
  "node_modules/jose/dist/node/esm/runtime/base64url.js"() {
    import_node_buffer = require("node:buffer");
    init_buffer_utils();
    encode = (input) => import_node_buffer.Buffer.from(input).toString("base64url");
    decode = (input) => new Uint8Array(import_node_buffer.Buffer.from(normalize(input), "base64url"));
  }
});

// node_modules/jose/dist/node/esm/util/errors.js
var JOSEError, JWTClaimValidationFailed, JWTExpired, JOSEAlgNotAllowed, JOSENotSupported, JWSInvalid, JWTInvalid, JWSSignatureVerificationFailed;
var init_errors = __esm({
  "node_modules/jose/dist/node/esm/util/errors.js"() {
    JOSEError = class extends Error {
      static code = "ERR_JOSE_GENERIC";
      code = "ERR_JOSE_GENERIC";
      constructor(message3, options) {
        super(message3, options);
        this.name = this.constructor.name;
        Error.captureStackTrace?.(this, this.constructor);
      }
    };
    JWTClaimValidationFailed = class extends JOSEError {
      static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
      code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
      claim;
      reason;
      payload;
      constructor(message3, payload, claim = "unspecified", reason = "unspecified") {
        super(message3, { cause: { claim, reason, payload } });
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
      }
    };
    JWTExpired = class extends JOSEError {
      static code = "ERR_JWT_EXPIRED";
      code = "ERR_JWT_EXPIRED";
      claim;
      reason;
      payload;
      constructor(message3, payload, claim = "unspecified", reason = "unspecified") {
        super(message3, { cause: { claim, reason, payload } });
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
      }
    };
    JOSEAlgNotAllowed = class extends JOSEError {
      static code = "ERR_JOSE_ALG_NOT_ALLOWED";
      code = "ERR_JOSE_ALG_NOT_ALLOWED";
    };
    JOSENotSupported = class extends JOSEError {
      static code = "ERR_JOSE_NOT_SUPPORTED";
      code = "ERR_JOSE_NOT_SUPPORTED";
    };
    JWSInvalid = class extends JOSEError {
      static code = "ERR_JWS_INVALID";
      code = "ERR_JWS_INVALID";
    };
    JWTInvalid = class extends JOSEError {
      static code = "ERR_JWT_INVALID";
      code = "ERR_JWT_INVALID";
    };
    JWSSignatureVerificationFailed = class extends JOSEError {
      static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      constructor(message3 = "signature verification failed", options) {
        super(message3, options);
      }
    };
  }
});

// node_modules/jose/dist/node/esm/runtime/is_key_object.js
var util, is_key_object_default;
var init_is_key_object = __esm({
  "node_modules/jose/dist/node/esm/runtime/is_key_object.js"() {
    util = __toESM(require("node:util"), 1);
    is_key_object_default = (obj) => util.types.isKeyObject(obj);
  }
});

// node_modules/jose/dist/node/esm/runtime/webcrypto.js
var crypto, util2, webcrypto2, webcrypto_default, isCryptoKey;
var init_webcrypto = __esm({
  "node_modules/jose/dist/node/esm/runtime/webcrypto.js"() {
    crypto = __toESM(require("node:crypto"), 1);
    util2 = __toESM(require("node:util"), 1);
    webcrypto2 = crypto.webcrypto;
    webcrypto_default = webcrypto2;
    isCryptoKey = (key2) => util2.types.isCryptoKey(key2);
  }
});

// node_modules/jose/dist/node/esm/lib/crypto_key.js
function unusable(name, prop = "algorithm.name") {
  return new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
}
function isAlgorithm(algorithm, name) {
  return algorithm.name === name;
}
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
function checkUsage(key2, usages) {
  if (usages.length && !usages.some((expected) => key2.usages.includes(expected))) {
    let msg = "CryptoKey does not support this operation, its usages must include ";
    if (usages.length > 2) {
      const last = usages.pop();
      msg += `one of ${usages.join(", ")}, or ${last}.`;
    } else if (usages.length === 2) {
      msg += `one of ${usages[0]} or ${usages[1]}.`;
    } else {
      msg += `${usages[0]}.`;
    }
    throw new TypeError(msg);
  }
}
function checkSigCryptoKey(key2, alg, ...usages) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key2.algorithm, "HMAC"))
        throw unusable("HMAC");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key2.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key2.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key2.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key2.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key2.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "EdDSA": {
      if (key2.algorithm.name !== "Ed25519" && key2.algorithm.name !== "Ed448") {
        throw unusable("Ed25519 or Ed448");
      }
      break;
    }
    case "Ed25519": {
      if (!isAlgorithm(key2.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key2.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key2.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key2, usages);
}
var init_crypto_key = __esm({
  "node_modules/jose/dist/node/esm/lib/crypto_key.js"() {
  }
});

// node_modules/jose/dist/node/esm/lib/invalid_key_input.js
function message2(msg, actual, ...types4) {
  types4 = types4.filter(Boolean);
  if (types4.length > 2) {
    const last = types4.pop();
    msg += `one of type ${types4.join(", ")}, or ${last}.`;
  } else if (types4.length === 2) {
    msg += `one of type ${types4[0]} or ${types4[1]}.`;
  } else {
    msg += `of type ${types4[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
function withAlg(alg, actual, ...types4) {
  return message2(`Key for the ${alg} algorithm must be `, actual, ...types4);
}
var invalid_key_input_default;
var init_invalid_key_input = __esm({
  "node_modules/jose/dist/node/esm/lib/invalid_key_input.js"() {
    invalid_key_input_default = (actual, ...types4) => {
      return message2("Key must be ", actual, ...types4);
    };
  }
});

// node_modules/jose/dist/node/esm/runtime/is_key_like.js
var is_key_like_default, types3;
var init_is_key_like = __esm({
  "node_modules/jose/dist/node/esm/runtime/is_key_like.js"() {
    init_webcrypto();
    init_is_key_object();
    is_key_like_default = (key2) => is_key_object_default(key2) || isCryptoKey(key2);
    types3 = ["KeyObject"];
    if (globalThis.CryptoKey || webcrypto_default?.CryptoKey) {
      types3.push("CryptoKey");
    }
  }
});

// node_modules/jose/dist/node/esm/lib/is_disjoint.js
var isDisjoint, is_disjoint_default;
var init_is_disjoint = __esm({
  "node_modules/jose/dist/node/esm/lib/is_disjoint.js"() {
    isDisjoint = (...headers) => {
      const sources = headers.filter(Boolean);
      if (sources.length === 0 || sources.length === 1) {
        return true;
      }
      let acc;
      for (const header of sources) {
        const parameters = Object.keys(header);
        if (!acc || acc.size === 0) {
          acc = new Set(parameters);
          continue;
        }
        for (const parameter of parameters) {
          if (acc.has(parameter)) {
            return false;
          }
          acc.add(parameter);
        }
      }
      return true;
    };
    is_disjoint_default = isDisjoint;
  }
});

// node_modules/jose/dist/node/esm/lib/is_object.js
function isObjectLike(value) {
  return typeof value === "object" && value !== null;
}
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
var init_is_object = __esm({
  "node_modules/jose/dist/node/esm/lib/is_object.js"() {
  }
});

// node_modules/jose/dist/node/esm/lib/is_jwk.js
function isJWK(key2) {
  return isObject(key2) && typeof key2.kty === "string";
}
function isPrivateJWK(key2) {
  return key2.kty !== "oct" && typeof key2.d === "string";
}
function isPublicJWK(key2) {
  return key2.kty !== "oct" && typeof key2.d === "undefined";
}
function isSecretJWK(key2) {
  return isJWK(key2) && key2.kty === "oct" && typeof key2.k === "string";
}
var init_is_jwk = __esm({
  "node_modules/jose/dist/node/esm/lib/is_jwk.js"() {
    init_is_object();
  }
});

// node_modules/jose/dist/node/esm/runtime/get_named_curve.js
var import_node_crypto, namedCurveToJOSE, getNamedCurve2, get_named_curve_default;
var init_get_named_curve = __esm({
  "node_modules/jose/dist/node/esm/runtime/get_named_curve.js"() {
    import_node_crypto = require("node:crypto");
    init_errors();
    init_webcrypto();
    init_is_key_object();
    init_invalid_key_input();
    init_is_key_like();
    init_is_jwk();
    namedCurveToJOSE = (namedCurve) => {
      switch (namedCurve) {
        case "prime256v1":
          return "P-256";
        case "secp384r1":
          return "P-384";
        case "secp521r1":
          return "P-521";
        case "secp256k1":
          return "secp256k1";
        default:
          throw new JOSENotSupported("Unsupported key curve for this operation");
      }
    };
    getNamedCurve2 = (kee, raw) => {
      let key2;
      if (isCryptoKey(kee)) {
        key2 = import_node_crypto.KeyObject.from(kee);
      } else if (is_key_object_default(kee)) {
        key2 = kee;
      } else if (isJWK(kee)) {
        return kee.crv;
      } else {
        throw new TypeError(invalid_key_input_default(kee, ...types3));
      }
      if (key2.type === "secret") {
        throw new TypeError('only "private" or "public" type keys can be used for this operation');
      }
      switch (key2.asymmetricKeyType) {
        case "ed25519":
        case "ed448":
          return `Ed${key2.asymmetricKeyType.slice(2)}`;
        case "x25519":
        case "x448":
          return `X${key2.asymmetricKeyType.slice(1)}`;
        case "ec": {
          const namedCurve = key2.asymmetricKeyDetails.namedCurve;
          if (raw) {
            return namedCurve;
          }
          return namedCurveToJOSE(namedCurve);
        }
        default:
          throw new TypeError("Invalid asymmetric key type for this operation");
      }
    };
    get_named_curve_default = getNamedCurve2;
  }
});

// node_modules/jose/dist/node/esm/runtime/check_key_length.js
var import_node_crypto2, check_key_length_default;
var init_check_key_length = __esm({
  "node_modules/jose/dist/node/esm/runtime/check_key_length.js"() {
    import_node_crypto2 = require("node:crypto");
    check_key_length_default = (key2, alg) => {
      let modulusLength;
      try {
        if (key2 instanceof import_node_crypto2.KeyObject) {
          modulusLength = key2.asymmetricKeyDetails?.modulusLength;
        } else {
          modulusLength = Buffer.from(key2.n, "base64url").byteLength << 3;
        }
      } catch {
      }
      if (typeof modulusLength !== "number" || modulusLength < 2048) {
        throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
      }
    };
  }
});

// node_modules/jose/dist/node/esm/runtime/jwk_to_key.js
var import_node_crypto3, parse, jwk_to_key_default;
var init_jwk_to_key = __esm({
  "node_modules/jose/dist/node/esm/runtime/jwk_to_key.js"() {
    import_node_crypto3 = require("node:crypto");
    parse = (key2) => {
      if (key2.d) {
        return (0, import_node_crypto3.createPrivateKey)({ format: "jwk", key: key2 });
      }
      return (0, import_node_crypto3.createPublicKey)({ format: "jwk", key: key2 });
    };
    jwk_to_key_default = parse;
  }
});

// node_modules/jose/dist/node/esm/key/import.js
async function importJWK(jwk, alg) {
  if (!isObject(jwk)) {
    throw new TypeError("JWK must be an object");
  }
  alg ||= jwk.alg;
  switch (jwk.kty) {
    case "oct":
      if (typeof jwk.k !== "string" || !jwk.k) {
        throw new TypeError('missing "k" (Key Value) Parameter value');
      }
      return decode(jwk.k);
    case "RSA":
      if ("oth" in jwk && jwk.oth !== void 0) {
        throw new JOSENotSupported('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
      }
    case "EC":
    case "OKP":
      return jwk_to_key_default({ ...jwk, alg });
    default:
      throw new JOSENotSupported('Unsupported "kty" (Key Type) Parameter value');
  }
}
var init_import = __esm({
  "node_modules/jose/dist/node/esm/key/import.js"() {
    init_base64url();
    init_jwk_to_key();
    init_errors();
    init_is_object();
  }
});

// node_modules/jose/dist/node/esm/lib/check_key_type.js
function checkKeyType(allowJwk, alg, key2, usage) {
  const symmetric = alg.startsWith("HS") || alg === "dir" || alg.startsWith("PBES2") || /^A\d{3}(?:GCM)?KW$/.test(alg);
  if (symmetric) {
    symmetricTypeCheck(alg, key2, usage, allowJwk);
  } else {
    asymmetricTypeCheck(alg, key2, usage, allowJwk);
  }
}
var tag, jwkMatchesOp, symmetricTypeCheck, asymmetricTypeCheck, check_key_type_default, checkKeyTypeWithJwk;
var init_check_key_type = __esm({
  "node_modules/jose/dist/node/esm/lib/check_key_type.js"() {
    init_invalid_key_input();
    init_is_key_like();
    init_is_jwk();
    tag = (key2) => key2?.[Symbol.toStringTag];
    jwkMatchesOp = (alg, key2, usage) => {
      if (key2.use !== void 0 && key2.use !== "sig") {
        throw new TypeError("Invalid key for this operation, when present its use must be sig");
      }
      if (key2.key_ops !== void 0 && key2.key_ops.includes?.(usage) !== true) {
        throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${usage}`);
      }
      if (key2.alg !== void 0 && key2.alg !== alg) {
        throw new TypeError(`Invalid key for this operation, when present its alg must be ${alg}`);
      }
      return true;
    };
    symmetricTypeCheck = (alg, key2, usage, allowJwk) => {
      if (key2 instanceof Uint8Array)
        return;
      if (allowJwk && isJWK(key2)) {
        if (isSecretJWK(key2) && jwkMatchesOp(alg, key2, usage))
          return;
        throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
      }
      if (!is_key_like_default(key2)) {
        throw new TypeError(withAlg(alg, key2, ...types3, "Uint8Array", allowJwk ? "JSON Web Key" : null));
      }
      if (key2.type !== "secret") {
        throw new TypeError(`${tag(key2)} instances for symmetric algorithms must be of type "secret"`);
      }
    };
    asymmetricTypeCheck = (alg, key2, usage, allowJwk) => {
      if (allowJwk && isJWK(key2)) {
        switch (usage) {
          case "sign":
            if (isPrivateJWK(key2) && jwkMatchesOp(alg, key2, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation be a private JWK`);
          case "verify":
            if (isPublicJWK(key2) && jwkMatchesOp(alg, key2, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation be a public JWK`);
        }
      }
      if (!is_key_like_default(key2)) {
        throw new TypeError(withAlg(alg, key2, ...types3, allowJwk ? "JSON Web Key" : null));
      }
      if (key2.type === "secret") {
        throw new TypeError(`${tag(key2)} instances for asymmetric algorithms must not be of type "secret"`);
      }
      if (usage === "sign" && key2.type === "public") {
        throw new TypeError(`${tag(key2)} instances for asymmetric algorithm signing must be of type "private"`);
      }
      if (usage === "decrypt" && key2.type === "public") {
        throw new TypeError(`${tag(key2)} instances for asymmetric algorithm decryption must be of type "private"`);
      }
      if (key2.algorithm && usage === "verify" && key2.type === "private") {
        throw new TypeError(`${tag(key2)} instances for asymmetric algorithm verifying must be of type "public"`);
      }
      if (key2.algorithm && usage === "encrypt" && key2.type === "private") {
        throw new TypeError(`${tag(key2)} instances for asymmetric algorithm encryption must be of type "public"`);
      }
    };
    check_key_type_default = checkKeyType.bind(void 0, false);
    checkKeyTypeWithJwk = checkKeyType.bind(void 0, true);
  }
});

// node_modules/jose/dist/node/esm/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
var validate_crit_default;
var init_validate_crit = __esm({
  "node_modules/jose/dist/node/esm/lib/validate_crit.js"() {
    init_errors();
    validate_crit_default = validateCrit;
  }
});

// node_modules/jose/dist/node/esm/lib/validate_algorithms.js
var validateAlgorithms, validate_algorithms_default;
var init_validate_algorithms = __esm({
  "node_modules/jose/dist/node/esm/lib/validate_algorithms.js"() {
    validateAlgorithms = (option, algorithms) => {
      if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
        throw new TypeError(`"${option}" option must be an array of strings`);
      }
      if (!algorithms) {
        return void 0;
      }
      return new Set(algorithms);
    };
    validate_algorithms_default = validateAlgorithms;
  }
});

// node_modules/jose/dist/node/esm/runtime/dsa_digest.js
function dsaDigest(alg) {
  switch (alg) {
    case "PS256":
    case "RS256":
    case "ES256":
    case "ES256K":
      return "sha256";
    case "PS384":
    case "RS384":
    case "ES384":
      return "sha384";
    case "PS512":
    case "RS512":
    case "ES512":
      return "sha512";
    case "Ed25519":
    case "EdDSA":
      return void 0;
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
var init_dsa_digest = __esm({
  "node_modules/jose/dist/node/esm/runtime/dsa_digest.js"() {
    init_errors();
  }
});

// node_modules/jose/dist/node/esm/runtime/node_key.js
function keyForCrypto(alg, key2) {
  let asymmetricKeyType;
  let asymmetricKeyDetails;
  let isJWK2;
  if (key2 instanceof import_node_crypto4.KeyObject) {
    asymmetricKeyType = key2.asymmetricKeyType;
    asymmetricKeyDetails = key2.asymmetricKeyDetails;
  } else {
    isJWK2 = true;
    switch (key2.kty) {
      case "RSA":
        asymmetricKeyType = "rsa";
        break;
      case "EC":
        asymmetricKeyType = "ec";
        break;
      case "OKP": {
        if (key2.crv === "Ed25519") {
          asymmetricKeyType = "ed25519";
          break;
        }
        if (key2.crv === "Ed448") {
          asymmetricKeyType = "ed448";
          break;
        }
        throw new TypeError("Invalid key for this operation, its crv must be Ed25519 or Ed448");
      }
      default:
        throw new TypeError("Invalid key for this operation, its kty must be RSA, OKP, or EC");
    }
  }
  let options;
  switch (alg) {
    case "Ed25519":
      if (asymmetricKeyType !== "ed25519") {
        throw new TypeError(`Invalid key for this operation, its asymmetricKeyType must be ed25519`);
      }
      break;
    case "EdDSA":
      if (!["ed25519", "ed448"].includes(asymmetricKeyType)) {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be ed25519 or ed448");
      }
      break;
    case "RS256":
    case "RS384":
    case "RS512":
      if (asymmetricKeyType !== "rsa") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be rsa");
      }
      check_key_length_default(key2, alg);
      break;
    case "PS256":
    case "PS384":
    case "PS512":
      if (asymmetricKeyType === "rsa-pss") {
        const { hashAlgorithm, mgf1HashAlgorithm, saltLength } = asymmetricKeyDetails;
        const length = parseInt(alg.slice(-3), 10);
        if (hashAlgorithm !== void 0 && (hashAlgorithm !== `sha${length}` || mgf1HashAlgorithm !== hashAlgorithm)) {
          throw new TypeError(`Invalid key for this operation, its RSA-PSS parameters do not meet the requirements of "alg" ${alg}`);
        }
        if (saltLength !== void 0 && saltLength > length >> 3) {
          throw new TypeError(`Invalid key for this operation, its RSA-PSS parameter saltLength does not meet the requirements of "alg" ${alg}`);
        }
      } else if (asymmetricKeyType !== "rsa") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be rsa or rsa-pss");
      }
      check_key_length_default(key2, alg);
      options = {
        padding: import_node_crypto4.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: import_node_crypto4.constants.RSA_PSS_SALTLEN_DIGEST
      };
      break;
    case "ES256":
    case "ES256K":
    case "ES384":
    case "ES512": {
      if (asymmetricKeyType !== "ec") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be ec");
      }
      const actual = get_named_curve_default(key2);
      const expected = ecCurveAlgMap.get(alg);
      if (actual !== expected) {
        throw new TypeError(`Invalid key curve for the algorithm, its curve must be ${expected}, got ${actual}`);
      }
      options = { dsaEncoding: "ieee-p1363" };
      break;
    }
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
  if (isJWK2) {
    return { format: "jwk", key: key2, ...options };
  }
  return options ? { ...options, key: key2 } : key2;
}
var import_node_crypto4, ecCurveAlgMap;
var init_node_key = __esm({
  "node_modules/jose/dist/node/esm/runtime/node_key.js"() {
    import_node_crypto4 = require("node:crypto");
    init_get_named_curve();
    init_errors();
    init_check_key_length();
    ecCurveAlgMap = /* @__PURE__ */ new Map([
      ["ES256", "P-256"],
      ["ES256K", "secp256k1"],
      ["ES384", "P-384"],
      ["ES512", "P-521"]
    ]);
  }
});

// node_modules/jose/dist/node/esm/runtime/hmac_digest.js
function hmacDigest(alg) {
  switch (alg) {
    case "HS256":
      return "sha256";
    case "HS384":
      return "sha384";
    case "HS512":
      return "sha512";
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
var init_hmac_digest = __esm({
  "node_modules/jose/dist/node/esm/runtime/hmac_digest.js"() {
    init_errors();
  }
});

// node_modules/jose/dist/node/esm/runtime/get_sign_verify_key.js
function getSignVerifyKey(alg, key2, usage) {
  if (key2 instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalid_key_input_default(key2, ...types3));
    }
    return (0, import_node_crypto5.createSecretKey)(key2);
  }
  if (key2 instanceof import_node_crypto5.KeyObject) {
    return key2;
  }
  if (isCryptoKey(key2)) {
    checkSigCryptoKey(key2, alg, usage);
    return import_node_crypto5.KeyObject.from(key2);
  }
  if (isJWK(key2)) {
    if (alg.startsWith("HS")) {
      return (0, import_node_crypto5.createSecretKey)(Buffer.from(key2.k, "base64url"));
    }
    return key2;
  }
  throw new TypeError(invalid_key_input_default(key2, ...types3, "Uint8Array", "JSON Web Key"));
}
var import_node_crypto5;
var init_get_sign_verify_key = __esm({
  "node_modules/jose/dist/node/esm/runtime/get_sign_verify_key.js"() {
    import_node_crypto5 = require("node:crypto");
    init_webcrypto();
    init_crypto_key();
    init_invalid_key_input();
    init_is_key_like();
    init_is_jwk();
  }
});

// node_modules/jose/dist/node/esm/runtime/sign.js
var crypto2, import_node_util, oneShotSign, sign2, sign_default;
var init_sign = __esm({
  "node_modules/jose/dist/node/esm/runtime/sign.js"() {
    crypto2 = __toESM(require("node:crypto"), 1);
    import_node_util = require("node:util");
    init_dsa_digest();
    init_hmac_digest();
    init_node_key();
    init_get_sign_verify_key();
    oneShotSign = (0, import_node_util.promisify)(crypto2.sign);
    sign2 = async (alg, key2, data) => {
      const k = getSignVerifyKey(alg, key2, "sign");
      if (alg.startsWith("HS")) {
        const hmac = crypto2.createHmac(hmacDigest(alg), k);
        hmac.update(data);
        return hmac.digest();
      }
      return oneShotSign(dsaDigest(alg), data, keyForCrypto(alg, k));
    };
    sign_default = sign2;
  }
});

// node_modules/jose/dist/node/esm/runtime/verify.js
var crypto3, import_node_util2, oneShotVerify, verify2, verify_default;
var init_verify = __esm({
  "node_modules/jose/dist/node/esm/runtime/verify.js"() {
    crypto3 = __toESM(require("node:crypto"), 1);
    import_node_util2 = require("node:util");
    init_dsa_digest();
    init_node_key();
    init_sign();
    init_get_sign_verify_key();
    oneShotVerify = (0, import_node_util2.promisify)(crypto3.verify);
    verify2 = async (alg, key2, signature, data) => {
      const k = getSignVerifyKey(alg, key2, "verify");
      if (alg.startsWith("HS")) {
        const expected = await sign_default(alg, k, data);
        const actual = signature;
        try {
          return crypto3.timingSafeEqual(actual, expected);
        } catch {
          return false;
        }
      }
      const algorithm = dsaDigest(alg);
      const keyInput = keyForCrypto(alg, k);
      try {
        return await oneShotVerify(algorithm, data, keyInput, signature);
      } catch {
        return false;
      }
    };
    verify_default = verify2;
  }
});

// node_modules/jose/dist/node/esm/jws/flattened/verify.js
async function flattenedVerify(jws, key2, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!is_disjoint_default(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validate_crit_default(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validate_algorithms_default("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key2 === "function") {
    key2 = await key2(parsedProt, jws);
    resolvedKey = true;
    checkKeyTypeWithJwk(alg, key2, "verify");
    if (isJWK(key2)) {
      key2 = await importJWK(key2, alg);
    }
  } else {
    checkKeyTypeWithJwk(alg, key2, "verify");
  }
  const data = concat(encoder.encode(jws.protected ?? ""), encoder.encode("."), typeof jws.payload === "string" ? encoder.encode(jws.payload) : jws.payload);
  let signature;
  try {
    signature = decode(jws.signature);
  } catch {
    throw new JWSInvalid("Failed to base64url decode the signature");
  }
  const verified = await verify_default(alg, key2, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    try {
      payload = decode(jws.payload);
    } catch {
      throw new JWSInvalid("Failed to base64url decode the payload");
    }
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key: key2 };
  }
  return result;
}
var init_verify2 = __esm({
  "node_modules/jose/dist/node/esm/jws/flattened/verify.js"() {
    init_base64url();
    init_verify();
    init_errors();
    init_buffer_utils();
    init_is_disjoint();
    init_is_object();
    init_check_key_type();
    init_validate_crit();
    init_validate_algorithms();
    init_is_jwk();
    init_import();
  }
});

// node_modules/jose/dist/node/esm/jws/compact/verify.js
async function compactVerify(jws, key2, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key2, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key2 === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
var init_verify3 = __esm({
  "node_modules/jose/dist/node/esm/jws/compact/verify.js"() {
    init_verify2();
    init_errors();
    init_buffer_utils();
  }
});

// node_modules/jose/dist/node/esm/lib/epoch.js
var epoch_default;
var init_epoch = __esm({
  "node_modules/jose/dist/node/esm/lib/epoch.js"() {
    epoch_default = (date) => Math.floor(date.getTime() / 1e3);
  }
});

// node_modules/jose/dist/node/esm/lib/secs.js
var minute, hour, day, week, year, REGEX, secs_default;
var init_secs = __esm({
  "node_modules/jose/dist/node/esm/lib/secs.js"() {
    minute = 60;
    hour = minute * 60;
    day = hour * 24;
    week = day * 7;
    year = day * 365.25;
    REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
    secs_default = (str) => {
      const matched = REGEX.exec(str);
      if (!matched || matched[4] && matched[1]) {
        throw new TypeError("Invalid time period format");
      }
      const value = parseFloat(matched[2]);
      const unit = matched[3].toLowerCase();
      let numericDate;
      switch (unit) {
        case "sec":
        case "secs":
        case "second":
        case "seconds":
        case "s":
          numericDate = Math.round(value);
          break;
        case "minute":
        case "minutes":
        case "min":
        case "mins":
        case "m":
          numericDate = Math.round(value * minute);
          break;
        case "hour":
        case "hours":
        case "hr":
        case "hrs":
        case "h":
          numericDate = Math.round(value * hour);
          break;
        case "day":
        case "days":
        case "d":
          numericDate = Math.round(value * day);
          break;
        case "week":
        case "weeks":
        case "w":
          numericDate = Math.round(value * week);
          break;
        default:
          numericDate = Math.round(value * year);
          break;
      }
      if (matched[1] === "-" || matched[4] === "ago") {
        return -numericDate;
      }
      return numericDate;
    };
  }
});

// node_modules/jose/dist/node/esm/lib/jwt_claims_set.js
var normalizeTyp, checkAudiencePresence, jwt_claims_set_default;
var init_jwt_claims_set = __esm({
  "node_modules/jose/dist/node/esm/lib/jwt_claims_set.js"() {
    init_errors();
    init_buffer_utils();
    init_epoch();
    init_secs();
    init_is_object();
    normalizeTyp = (value) => value.toLowerCase().replace(/^application\//, "");
    checkAudiencePresence = (audPayload, audOption) => {
      if (typeof audPayload === "string") {
        return audOption.includes(audPayload);
      }
      if (Array.isArray(audPayload)) {
        return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
      }
      return false;
    };
    jwt_claims_set_default = (protectedHeader, encodedPayload, options = {}) => {
      let payload;
      try {
        payload = JSON.parse(decoder.decode(encodedPayload));
      } catch {
      }
      if (!isObject(payload)) {
        throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
      }
      const { typ } = options;
      if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
        throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
      }
      const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
      const presenceCheck = [...requiredClaims];
      if (maxTokenAge !== void 0)
        presenceCheck.push("iat");
      if (audience !== void 0)
        presenceCheck.push("aud");
      if (subject !== void 0)
        presenceCheck.push("sub");
      if (issuer !== void 0)
        presenceCheck.push("iss");
      for (const claim of new Set(presenceCheck.reverse())) {
        if (!(claim in payload)) {
          throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
        }
      }
      if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
        throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
      }
      if (subject && payload.sub !== subject) {
        throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
      }
      if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
        throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
      }
      let tolerance;
      switch (typeof options.clockTolerance) {
        case "string":
          tolerance = secs_default(options.clockTolerance);
          break;
        case "number":
          tolerance = options.clockTolerance;
          break;
        case "undefined":
          tolerance = 0;
          break;
        default:
          throw new TypeError("Invalid clockTolerance option type");
      }
      const { currentDate } = options;
      const now = epoch_default(currentDate || /* @__PURE__ */ new Date());
      if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
        throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
      }
      if (payload.nbf !== void 0) {
        if (typeof payload.nbf !== "number") {
          throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
        }
        if (payload.nbf > now + tolerance) {
          throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
        }
      }
      if (payload.exp !== void 0) {
        if (typeof payload.exp !== "number") {
          throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
        }
        if (payload.exp <= now - tolerance) {
          throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
        }
      }
      if (maxTokenAge) {
        const age = now - payload.iat;
        const max = typeof maxTokenAge === "number" ? maxTokenAge : secs_default(maxTokenAge);
        if (age - tolerance > max) {
          throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
        }
        if (age < 0 - tolerance) {
          throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
        }
      }
      return payload;
    };
  }
});

// node_modules/jose/dist/node/esm/jwt/verify.js
async function jwtVerify(jwt, key2, options) {
  const verified = await compactVerify(jwt, key2, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = jwt_claims_set_default(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key2 === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
var init_verify4 = __esm({
  "node_modules/jose/dist/node/esm/jwt/verify.js"() {
    init_verify3();
    init_jwt_claims_set();
    init_errors();
  }
});

// node_modules/jose/dist/node/esm/jws/flattened/sign.js
var FlattenedSign;
var init_sign2 = __esm({
  "node_modules/jose/dist/node/esm/jws/flattened/sign.js"() {
    init_base64url();
    init_sign();
    init_is_disjoint();
    init_errors();
    init_buffer_utils();
    init_check_key_type();
    init_validate_crit();
    FlattenedSign = class {
      _payload;
      _protectedHeader;
      _unprotectedHeader;
      constructor(payload) {
        if (!(payload instanceof Uint8Array)) {
          throw new TypeError("payload must be an instance of Uint8Array");
        }
        this._payload = payload;
      }
      setProtectedHeader(protectedHeader) {
        if (this._protectedHeader) {
          throw new TypeError("setProtectedHeader can only be called once");
        }
        this._protectedHeader = protectedHeader;
        return this;
      }
      setUnprotectedHeader(unprotectedHeader) {
        if (this._unprotectedHeader) {
          throw new TypeError("setUnprotectedHeader can only be called once");
        }
        this._unprotectedHeader = unprotectedHeader;
        return this;
      }
      async sign(key2, options) {
        if (!this._protectedHeader && !this._unprotectedHeader) {
          throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
        }
        if (!is_disjoint_default(this._protectedHeader, this._unprotectedHeader)) {
          throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
        }
        const joseHeader = {
          ...this._protectedHeader,
          ...this._unprotectedHeader
        };
        const extensions = validate_crit_default(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this._protectedHeader, joseHeader);
        let b64 = true;
        if (extensions.has("b64")) {
          b64 = this._protectedHeader.b64;
          if (typeof b64 !== "boolean") {
            throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
          }
        }
        const { alg } = joseHeader;
        if (typeof alg !== "string" || !alg) {
          throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
        }
        checkKeyTypeWithJwk(alg, key2, "sign");
        let payload = this._payload;
        if (b64) {
          payload = encoder.encode(encode(payload));
        }
        let protectedHeader;
        if (this._protectedHeader) {
          protectedHeader = encoder.encode(encode(JSON.stringify(this._protectedHeader)));
        } else {
          protectedHeader = encoder.encode("");
        }
        const data = concat(protectedHeader, encoder.encode("."), payload);
        const signature = await sign_default(alg, key2, data);
        const jws = {
          signature: encode(signature),
          payload: ""
        };
        if (b64) {
          jws.payload = decoder.decode(payload);
        }
        if (this._unprotectedHeader) {
          jws.header = this._unprotectedHeader;
        }
        if (this._protectedHeader) {
          jws.protected = decoder.decode(protectedHeader);
        }
        return jws;
      }
    };
  }
});

// node_modules/jose/dist/node/esm/jws/compact/sign.js
var CompactSign;
var init_sign3 = __esm({
  "node_modules/jose/dist/node/esm/jws/compact/sign.js"() {
    init_sign2();
    CompactSign = class {
      _flattened;
      constructor(payload) {
        this._flattened = new FlattenedSign(payload);
      }
      setProtectedHeader(protectedHeader) {
        this._flattened.setProtectedHeader(protectedHeader);
        return this;
      }
      async sign(key2, options) {
        const jws = await this._flattened.sign(key2, options);
        if (jws.payload === void 0) {
          throw new TypeError("use the flattened module for creating JWS with b64: false");
        }
        return `${jws.protected}.${jws.payload}.${jws.signature}`;
      }
    };
  }
});

// node_modules/jose/dist/node/esm/jwt/produce.js
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
var ProduceJWT;
var init_produce = __esm({
  "node_modules/jose/dist/node/esm/jwt/produce.js"() {
    init_epoch();
    init_is_object();
    init_secs();
    ProduceJWT = class {
      _payload;
      constructor(payload = {}) {
        if (!isObject(payload)) {
          throw new TypeError("JWT Claims Set MUST be an object");
        }
        this._payload = payload;
      }
      setIssuer(issuer) {
        this._payload = { ...this._payload, iss: issuer };
        return this;
      }
      setSubject(subject) {
        this._payload = { ...this._payload, sub: subject };
        return this;
      }
      setAudience(audience) {
        this._payload = { ...this._payload, aud: audience };
        return this;
      }
      setJti(jwtId) {
        this._payload = { ...this._payload, jti: jwtId };
        return this;
      }
      setNotBefore(input) {
        if (typeof input === "number") {
          this._payload = { ...this._payload, nbf: validateInput("setNotBefore", input) };
        } else if (input instanceof Date) {
          this._payload = { ...this._payload, nbf: validateInput("setNotBefore", epoch_default(input)) };
        } else {
          this._payload = { ...this._payload, nbf: epoch_default(/* @__PURE__ */ new Date()) + secs_default(input) };
        }
        return this;
      }
      setExpirationTime(input) {
        if (typeof input === "number") {
          this._payload = { ...this._payload, exp: validateInput("setExpirationTime", input) };
        } else if (input instanceof Date) {
          this._payload = { ...this._payload, exp: validateInput("setExpirationTime", epoch_default(input)) };
        } else {
          this._payload = { ...this._payload, exp: epoch_default(/* @__PURE__ */ new Date()) + secs_default(input) };
        }
        return this;
      }
      setIssuedAt(input) {
        if (typeof input === "undefined") {
          this._payload = { ...this._payload, iat: epoch_default(/* @__PURE__ */ new Date()) };
        } else if (input instanceof Date) {
          this._payload = { ...this._payload, iat: validateInput("setIssuedAt", epoch_default(input)) };
        } else if (typeof input === "string") {
          this._payload = {
            ...this._payload,
            iat: validateInput("setIssuedAt", epoch_default(/* @__PURE__ */ new Date()) + secs_default(input))
          };
        } else {
          this._payload = { ...this._payload, iat: validateInput("setIssuedAt", input) };
        }
        return this;
      }
    };
  }
});

// node_modules/jose/dist/node/esm/jwt/sign.js
var SignJWT;
var init_sign4 = __esm({
  "node_modules/jose/dist/node/esm/jwt/sign.js"() {
    init_sign3();
    init_errors();
    init_buffer_utils();
    init_produce();
    SignJWT = class extends ProduceJWT {
      _protectedHeader;
      setProtectedHeader(protectedHeader) {
        this._protectedHeader = protectedHeader;
        return this;
      }
      async sign(key2, options) {
        const sig = new CompactSign(encoder.encode(JSON.stringify(this._payload)));
        sig.setProtectedHeader(this._protectedHeader);
        if (Array.isArray(this._protectedHeader?.crit) && this._protectedHeader.crit.includes("b64") && this._protectedHeader.b64 === false) {
          throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
        }
        return sig.sign(key2, options);
      }
    };
  }
});

// node_modules/jose/dist/node/esm/util/base64url.js
var init_base64url2 = __esm({
  "node_modules/jose/dist/node/esm/util/base64url.js"() {
  }
});

// node_modules/jose/dist/node/esm/index.js
var init_esm = __esm({
  "node_modules/jose/dist/node/esm/index.js"() {
    init_verify4();
    init_sign4();
    init_errors();
    init_base64url2();
  }
});

// node_modules/next/dist/compiled/@edge-runtime/cookies/index.js
var require_cookies = __commonJS({
  "node_modules/next/dist/compiled/@edge-runtime/cookies/index.js"(exports2, module2) {
    "use strict";
    var __defProp2 = Object.defineProperty;
    var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames2 = Object.getOwnPropertyNames;
    var __hasOwnProp2 = Object.prototype.hasOwnProperty;
    var __export2 = (target, all) => {
      for (var name in all)
        __defProp2(target, name, { get: all[name], enumerable: true });
    };
    var __copyProps2 = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key2 of __getOwnPropNames2(from))
          if (!__hasOwnProp2.call(to, key2) && key2 !== except)
            __defProp2(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc2(from, key2)) || desc.enumerable });
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps2(__defProp2({}, "__esModule", { value: true }), mod);
    var src_exports = {};
    __export2(src_exports, {
      RequestCookies: () => RequestCookies,
      ResponseCookies: () => ResponseCookies,
      parseCookie: () => parseCookie,
      parseSetCookie: () => parseSetCookie,
      stringifyCookie: () => stringifyCookie
    });
    module2.exports = __toCommonJS(src_exports);
    function stringifyCookie(c) {
      var _a;
      const attrs = [
        "path" in c && c.path && `Path=${c.path}`,
        "expires" in c && (c.expires || c.expires === 0) && `Expires=${(typeof c.expires === "number" ? new Date(c.expires) : c.expires).toUTCString()}`,
        "maxAge" in c && typeof c.maxAge === "number" && `Max-Age=${c.maxAge}`,
        "domain" in c && c.domain && `Domain=${c.domain}`,
        "secure" in c && c.secure && "Secure",
        "httpOnly" in c && c.httpOnly && "HttpOnly",
        "sameSite" in c && c.sameSite && `SameSite=${c.sameSite}`,
        "partitioned" in c && c.partitioned && "Partitioned",
        "priority" in c && c.priority && `Priority=${c.priority}`
      ].filter(Boolean);
      const stringified = `${c.name}=${encodeURIComponent((_a = c.value) != null ? _a : "")}`;
      return attrs.length === 0 ? stringified : `${stringified}; ${attrs.join("; ")}`;
    }
    function parseCookie(cookie) {
      const map = /* @__PURE__ */ new Map();
      for (const pair of cookie.split(/; */)) {
        if (!pair)
          continue;
        const splitAt = pair.indexOf("=");
        if (splitAt === -1) {
          map.set(pair, "true");
          continue;
        }
        const [key2, value] = [pair.slice(0, splitAt), pair.slice(splitAt + 1)];
        try {
          map.set(key2, decodeURIComponent(value != null ? value : "true"));
        } catch {
        }
      }
      return map;
    }
    function parseSetCookie(setCookie) {
      if (!setCookie) {
        return void 0;
      }
      const [[name, value], ...attributes] = parseCookie(setCookie);
      const {
        domain,
        expires,
        httponly,
        maxage,
        path: path2,
        samesite,
        secure,
        partitioned,
        priority
      } = Object.fromEntries(
        attributes.map(([key2, value2]) => [
          key2.toLowerCase().replace(/-/g, ""),
          value2
        ])
      );
      const cookie = {
        name,
        value: decodeURIComponent(value),
        domain,
        ...expires && { expires: new Date(expires) },
        ...httponly && { httpOnly: true },
        ...typeof maxage === "string" && { maxAge: Number(maxage) },
        path: path2,
        ...samesite && { sameSite: parseSameSite(samesite) },
        ...secure && { secure: true },
        ...priority && { priority: parsePriority(priority) },
        ...partitioned && { partitioned: true }
      };
      return compact(cookie);
    }
    function compact(t) {
      const newT = {};
      for (const key2 in t) {
        if (t[key2]) {
          newT[key2] = t[key2];
        }
      }
      return newT;
    }
    var SAME_SITE = ["strict", "lax", "none"];
    function parseSameSite(string) {
      string = string.toLowerCase();
      return SAME_SITE.includes(string) ? string : void 0;
    }
    var PRIORITY = ["low", "medium", "high"];
    function parsePriority(string) {
      string = string.toLowerCase();
      return PRIORITY.includes(string) ? string : void 0;
    }
    function splitCookiesString(cookiesString) {
      if (!cookiesString)
        return [];
      var cookiesStrings = [];
      var pos = 0;
      var start;
      var ch;
      var lastComma;
      var nextStart;
      var cookiesSeparatorFound;
      function skipWhitespace() {
        while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
          pos += 1;
        }
        return pos < cookiesString.length;
      }
      function notSpecialChar() {
        ch = cookiesString.charAt(pos);
        return ch !== "=" && ch !== ";" && ch !== ",";
      }
      while (pos < cookiesString.length) {
        start = pos;
        cookiesSeparatorFound = false;
        while (skipWhitespace()) {
          ch = cookiesString.charAt(pos);
          if (ch === ",") {
            lastComma = pos;
            pos += 1;
            skipWhitespace();
            nextStart = pos;
            while (pos < cookiesString.length && notSpecialChar()) {
              pos += 1;
            }
            if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
              cookiesSeparatorFound = true;
              pos = nextStart;
              cookiesStrings.push(cookiesString.substring(start, lastComma));
              start = pos;
            } else {
              pos = lastComma + 1;
            }
          } else {
            pos += 1;
          }
        }
        if (!cookiesSeparatorFound || pos >= cookiesString.length) {
          cookiesStrings.push(cookiesString.substring(start, cookiesString.length));
        }
      }
      return cookiesStrings;
    }
    var RequestCookies = class {
      constructor(requestHeaders) {
        this._parsed = /* @__PURE__ */ new Map();
        this._headers = requestHeaders;
        const header = requestHeaders.get("cookie");
        if (header) {
          const parsed = parseCookie(header);
          for (const [name, value] of parsed) {
            this._parsed.set(name, { name, value });
          }
        }
      }
      [Symbol.iterator]() {
        return this._parsed[Symbol.iterator]();
      }
      /**
       * The amount of cookies received from the client
       */
      get size() {
        return this._parsed.size;
      }
      get(...args) {
        const name = typeof args[0] === "string" ? args[0] : args[0].name;
        return this._parsed.get(name);
      }
      getAll(...args) {
        var _a;
        const all = Array.from(this._parsed);
        if (!args.length) {
          return all.map(([_, value]) => value);
        }
        const name = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
        return all.filter(([n]) => n === name).map(([_, value]) => value);
      }
      has(name) {
        return this._parsed.has(name);
      }
      set(...args) {
        const [name, value] = args.length === 1 ? [args[0].name, args[0].value] : args;
        const map = this._parsed;
        map.set(name, { name, value });
        this._headers.set(
          "cookie",
          Array.from(map).map(([_, value2]) => stringifyCookie(value2)).join("; ")
        );
        return this;
      }
      /**
       * Delete the cookies matching the passed name or names in the request.
       */
      delete(names) {
        const map = this._parsed;
        const result = !Array.isArray(names) ? map.delete(names) : names.map((name) => map.delete(name));
        this._headers.set(
          "cookie",
          Array.from(map).map(([_, value]) => stringifyCookie(value)).join("; ")
        );
        return result;
      }
      /**
       * Delete all the cookies in the cookies in the request.
       */
      clear() {
        this.delete(Array.from(this._parsed.keys()));
        return this;
      }
      /**
       * Format the cookies in the request as a string for logging
       */
      [/* @__PURE__ */ Symbol.for("edge-runtime.inspect.custom")]() {
        return `RequestCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`;
      }
      toString() {
        return [...this._parsed.values()].map((v) => `${v.name}=${encodeURIComponent(v.value)}`).join("; ");
      }
    };
    var ResponseCookies = class {
      constructor(responseHeaders) {
        this._parsed = /* @__PURE__ */ new Map();
        var _a, _b, _c;
        this._headers = responseHeaders;
        const setCookie = (_c = (_b = (_a = responseHeaders.getSetCookie) == null ? void 0 : _a.call(responseHeaders)) != null ? _b : responseHeaders.get("set-cookie")) != null ? _c : [];
        const cookieStrings = Array.isArray(setCookie) ? setCookie : splitCookiesString(setCookie);
        for (const cookieString of cookieStrings) {
          const parsed = parseSetCookie(cookieString);
          if (parsed)
            this._parsed.set(parsed.name, parsed);
        }
      }
      /**
       * {@link https://wicg.github.io/cookie-store/#CookieStore-get CookieStore#get} without the Promise.
       */
      get(...args) {
        const key2 = typeof args[0] === "string" ? args[0] : args[0].name;
        return this._parsed.get(key2);
      }
      /**
       * {@link https://wicg.github.io/cookie-store/#CookieStore-getAll CookieStore#getAll} without the Promise.
       */
      getAll(...args) {
        var _a;
        const all = Array.from(this._parsed.values());
        if (!args.length) {
          return all;
        }
        const key2 = typeof args[0] === "string" ? args[0] : (_a = args[0]) == null ? void 0 : _a.name;
        return all.filter((c) => c.name === key2);
      }
      has(name) {
        return this._parsed.has(name);
      }
      /**
       * {@link https://wicg.github.io/cookie-store/#CookieStore-set CookieStore#set} without the Promise.
       */
      set(...args) {
        const [name, value, cookie] = args.length === 1 ? [args[0].name, args[0].value, args[0]] : args;
        const map = this._parsed;
        map.set(name, normalizeCookie({ name, value, ...cookie }));
        replace(map, this._headers);
        return this;
      }
      /**
       * {@link https://wicg.github.io/cookie-store/#CookieStore-delete CookieStore#delete} without the Promise.
       */
      delete(...args) {
        const [name, options] = typeof args[0] === "string" ? [args[0]] : [args[0].name, args[0]];
        return this.set({ ...options, name, value: "", expires: /* @__PURE__ */ new Date(0) });
      }
      [/* @__PURE__ */ Symbol.for("edge-runtime.inspect.custom")]() {
        return `ResponseCookies ${JSON.stringify(Object.fromEntries(this._parsed))}`;
      }
      toString() {
        return [...this._parsed.values()].map(stringifyCookie).join("; ");
      }
    };
    function replace(bag, headers) {
      headers.delete("set-cookie");
      for (const [, value] of bag) {
        const serialized = stringifyCookie(value);
        headers.append("set-cookie", serialized);
      }
    }
    function normalizeCookie(cookie = { name: "", value: "" }) {
      if (typeof cookie.expires === "number") {
        cookie.expires = new Date(cookie.expires);
      }
      if (cookie.maxAge) {
        cookie.expires = new Date(Date.now() + cookie.maxAge * 1e3);
      }
      if (cookie.path === null || cookie.path === void 0) {
        cookie.path = "/";
      }
      return cookie;
    }
  }
});

// node_modules/next/dist/server/web/spec-extension/cookies.js
var require_cookies2 = __commonJS({
  "node_modules/next/dist/server/web/spec-extension/cookies.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      RequestCookies: function() {
        return _cookies.RequestCookies;
      },
      ResponseCookies: function() {
        return _cookies.ResponseCookies;
      },
      stringifyCookie: function() {
        return _cookies.stringifyCookie;
      }
    });
    var _cookies = require_cookies();
  }
});

// node_modules/next/dist/server/web/spec-extension/adapters/reflect.js
var require_reflect = __commonJS({
  "node_modules/next/dist/server/web/spec-extension/adapters/reflect.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "ReflectAdapter", {
      enumerable: true,
      get: function() {
        return ReflectAdapter;
      }
    });
    var ReflectAdapter = class {
      static get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      }
      static set(target, prop, value, receiver) {
        return Reflect.set(target, prop, value, receiver);
      }
      static has(target, prop) {
        return Reflect.has(target, prop);
      }
      static deleteProperty(target, prop) {
        return Reflect.deleteProperty(target, prop);
      }
    };
  }
});

// node_modules/next/dist/server/app-render/async-local-storage.js
var require_async_local_storage = __commonJS({
  "node_modules/next/dist/server/app-render/async-local-storage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      bindSnapshot: function() {
        return bindSnapshot;
      },
      createAsyncLocalStorage: function() {
        return createAsyncLocalStorage;
      },
      createSnapshot: function() {
        return createSnapshot;
      }
    });
    var sharedAsyncLocalStorageNotAvailableError = Object.defineProperty(new Error("Invariant: AsyncLocalStorage accessed in runtime where it is not available"), "__NEXT_ERROR_CODE", {
      value: "E504",
      enumerable: false,
      configurable: true
    });
    var FakeAsyncLocalStorage = class {
      disable() {
        throw sharedAsyncLocalStorageNotAvailableError;
      }
      getStore() {
        return void 0;
      }
      run() {
        throw sharedAsyncLocalStorageNotAvailableError;
      }
      exit() {
        throw sharedAsyncLocalStorageNotAvailableError;
      }
      enterWith() {
        throw sharedAsyncLocalStorageNotAvailableError;
      }
      static bind(fn) {
        return fn;
      }
    };
    var maybeGlobalAsyncLocalStorage = typeof globalThis !== "undefined" && globalThis.AsyncLocalStorage;
    function createAsyncLocalStorage() {
      if (maybeGlobalAsyncLocalStorage) {
        return new maybeGlobalAsyncLocalStorage();
      }
      return new FakeAsyncLocalStorage();
    }
    function bindSnapshot(fn) {
      if (maybeGlobalAsyncLocalStorage) {
        return maybeGlobalAsyncLocalStorage.bind(fn);
      }
      return FakeAsyncLocalStorage.bind(fn);
    }
    function createSnapshot() {
      if (maybeGlobalAsyncLocalStorage) {
        return maybeGlobalAsyncLocalStorage.snapshot();
      }
      return function(fn, ...args) {
        return fn(...args);
      };
    }
  }
});

// node_modules/next/dist/server/app-render/work-async-storage-instance.js
var require_work_async_storage_instance = __commonJS({
  "node_modules/next/dist/server/app-render/work-async-storage-instance.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "workAsyncStorageInstance", {
      enumerable: true,
      get: function() {
        return workAsyncStorageInstance;
      }
    });
    var _asynclocalstorage = require_async_local_storage();
    var workAsyncStorageInstance = (0, _asynclocalstorage.createAsyncLocalStorage)();
  }
});

// node_modules/next/dist/server/app-render/work-async-storage.external.js
var require_work_async_storage_external = __commonJS({
  "node_modules/next/dist/server/app-render/work-async-storage.external.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "workAsyncStorage", {
      enumerable: true,
      get: function() {
        return _workasyncstorageinstance.workAsyncStorageInstance;
      }
    });
    var _workasyncstorageinstance = require_work_async_storage_instance();
  }
});

// node_modules/next/dist/shared/lib/action-revalidation-kind.js
var require_action_revalidation_kind = __commonJS({
  "node_modules/next/dist/shared/lib/action-revalidation-kind.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      ActionDidNotRevalidate: function() {
        return ActionDidNotRevalidate;
      },
      ActionDidRevalidateDynamicOnly: function() {
        return ActionDidRevalidateDynamicOnly;
      },
      ActionDidRevalidateStaticAndDynamic: function() {
        return ActionDidRevalidateStaticAndDynamic;
      }
    });
    var ActionDidNotRevalidate = 0;
    var ActionDidRevalidateStaticAndDynamic = 1;
    var ActionDidRevalidateDynamicOnly = 2;
  }
});

// node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js
var require_request_cookies = __commonJS({
  "node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      MutableRequestCookiesAdapter: function() {
        return MutableRequestCookiesAdapter;
      },
      ReadonlyRequestCookiesError: function() {
        return ReadonlyRequestCookiesError;
      },
      RequestCookiesAdapter: function() {
        return RequestCookiesAdapter;
      },
      appendMutableCookies: function() {
        return appendMutableCookies;
      },
      areCookiesMutableInCurrentPhase: function() {
        return areCookiesMutableInCurrentPhase;
      },
      createCookiesWithMutableAccessCheck: function() {
        return createCookiesWithMutableAccessCheck;
      },
      getModifiedCookieValues: function() {
        return getModifiedCookieValues;
      },
      responseCookiesToRequestCookies: function() {
        return responseCookiesToRequestCookies;
      }
    });
    var _cookies = require_cookies2();
    var _reflect = require_reflect();
    var _workasyncstorageexternal = require_work_async_storage_external();
    var _actionrevalidationkind = require_action_revalidation_kind();
    var ReadonlyRequestCookiesError = class _ReadonlyRequestCookiesError extends Error {
      constructor() {
        super("Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options");
      }
      static callable() {
        throw new _ReadonlyRequestCookiesError();
      }
    };
    var RequestCookiesAdapter = class {
      static seal(cookies3) {
        return new Proxy(cookies3, {
          get(target, prop, receiver) {
            switch (prop) {
              case "clear":
              case "delete":
              case "set":
                return ReadonlyRequestCookiesError.callable;
              default:
                return _reflect.ReflectAdapter.get(target, prop, receiver);
            }
          }
        });
      }
    };
    var SYMBOL_MODIFY_COOKIE_VALUES = /* @__PURE__ */ Symbol.for("next.mutated.cookies");
    function getModifiedCookieValues(cookies3) {
      const modified = cookies3[SYMBOL_MODIFY_COOKIE_VALUES];
      if (!modified || !Array.isArray(modified) || modified.length === 0) {
        return [];
      }
      return modified;
    }
    function appendMutableCookies(headers, mutableCookies) {
      const modifiedCookieValues = getModifiedCookieValues(mutableCookies);
      if (modifiedCookieValues.length === 0) {
        return false;
      }
      const resCookies = new _cookies.ResponseCookies(headers);
      const returnedCookies = resCookies.getAll();
      for (const cookie of modifiedCookieValues) {
        resCookies.set(cookie);
      }
      for (const cookie of returnedCookies) {
        resCookies.set(cookie);
      }
      return true;
    }
    var MutableRequestCookiesAdapter = class {
      static wrap(cookies3, onUpdateCookies) {
        const responseCookies = new _cookies.ResponseCookies(new Headers());
        for (const cookie of cookies3.getAll()) {
          responseCookies.set(cookie);
        }
        let modifiedValues = [];
        const modifiedCookies = /* @__PURE__ */ new Set();
        const updateResponseCookies = () => {
          const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
          if (workStore) {
            workStore.pathWasRevalidated = _actionrevalidationkind.ActionDidRevalidateStaticAndDynamic;
          }
          const allCookies = responseCookies.getAll();
          modifiedValues = allCookies.filter((c) => modifiedCookies.has(c.name));
          if (onUpdateCookies) {
            const serializedCookies = [];
            for (const cookie of modifiedValues) {
              const tempCookies = new _cookies.ResponseCookies(new Headers());
              tempCookies.set(cookie);
              serializedCookies.push(tempCookies.toString());
            }
            onUpdateCookies(serializedCookies);
          }
        };
        const wrappedCookies = new Proxy(responseCookies, {
          get(target, prop, receiver) {
            switch (prop) {
              // A special symbol to get the modified cookie values
              case SYMBOL_MODIFY_COOKIE_VALUES:
                return modifiedValues;
              // TODO: Throw error if trying to set a cookie after the response
              // headers have been set.
              case "delete":
                return function(...args) {
                  modifiedCookies.add(typeof args[0] === "string" ? args[0] : args[0].name);
                  try {
                    target.delete(...args);
                    return wrappedCookies;
                  } finally {
                    updateResponseCookies();
                  }
                };
              case "set":
                return function(...args) {
                  modifiedCookies.add(typeof args[0] === "string" ? args[0] : args[0].name);
                  try {
                    target.set(...args);
                    return wrappedCookies;
                  } finally {
                    updateResponseCookies();
                  }
                };
              default:
                return _reflect.ReflectAdapter.get(target, prop, receiver);
            }
          }
        });
        return wrappedCookies;
      }
    };
    function createCookiesWithMutableAccessCheck(requestStore) {
      const wrappedCookies = new Proxy(requestStore.mutableCookies, {
        get(target, prop, receiver) {
          switch (prop) {
            case "delete":
              return function(...args) {
                ensureCookiesAreStillMutable(requestStore, "cookies().delete");
                target.delete(...args);
                return wrappedCookies;
              };
            case "set":
              return function(...args) {
                ensureCookiesAreStillMutable(requestStore, "cookies().set");
                target.set(...args);
                return wrappedCookies;
              };
            default:
              return _reflect.ReflectAdapter.get(target, prop, receiver);
          }
        }
      });
      return wrappedCookies;
    }
    function areCookiesMutableInCurrentPhase(requestStore) {
      return requestStore.phase === "action";
    }
    function ensureCookiesAreStillMutable(requestStore, _callingExpression) {
      if (!areCookiesMutableInCurrentPhase(requestStore)) {
        throw new ReadonlyRequestCookiesError();
      }
    }
    function responseCookiesToRequestCookies(responseCookies) {
      const requestCookies = new _cookies.RequestCookies(new Headers());
      for (const cookie of responseCookies.getAll()) {
        requestCookies.set(cookie);
      }
      return requestCookies;
    }
  }
});

// node_modules/next/dist/server/app-render/work-unit-async-storage-instance.js
var require_work_unit_async_storage_instance = __commonJS({
  "node_modules/next/dist/server/app-render/work-unit-async-storage-instance.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "workUnitAsyncStorageInstance", {
      enumerable: true,
      get: function() {
        return workUnitAsyncStorageInstance;
      }
    });
    var _asynclocalstorage = require_async_local_storage();
    var workUnitAsyncStorageInstance = (0, _asynclocalstorage.createAsyncLocalStorage)();
  }
});

// node_modules/next/dist/client/components/app-router-headers.js
var require_app_router_headers = __commonJS({
  "node_modules/next/dist/client/components/app-router-headers.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      ACTION_HEADER: function() {
        return ACTION_HEADER;
      },
      FLIGHT_HEADERS: function() {
        return FLIGHT_HEADERS;
      },
      NEXT_ACTION_NOT_FOUND_HEADER: function() {
        return NEXT_ACTION_NOT_FOUND_HEADER;
      },
      NEXT_ACTION_REVALIDATED_HEADER: function() {
        return NEXT_ACTION_REVALIDATED_HEADER;
      },
      NEXT_DID_POSTPONE_HEADER: function() {
        return NEXT_DID_POSTPONE_HEADER;
      },
      NEXT_HMR_REFRESH_HASH_COOKIE: function() {
        return NEXT_HMR_REFRESH_HASH_COOKIE;
      },
      NEXT_HMR_REFRESH_HEADER: function() {
        return NEXT_HMR_REFRESH_HEADER;
      },
      NEXT_HTML_REQUEST_ID_HEADER: function() {
        return NEXT_HTML_REQUEST_ID_HEADER;
      },
      NEXT_INSTANT_PREFETCH_HEADER: function() {
        return NEXT_INSTANT_PREFETCH_HEADER;
      },
      NEXT_INSTANT_TEST_COOKIE: function() {
        return NEXT_INSTANT_TEST_COOKIE;
      },
      NEXT_IS_PRERENDER_HEADER: function() {
        return NEXT_IS_PRERENDER_HEADER;
      },
      NEXT_REQUEST_ID_HEADER: function() {
        return NEXT_REQUEST_ID_HEADER;
      },
      NEXT_REWRITTEN_PATH_HEADER: function() {
        return NEXT_REWRITTEN_PATH_HEADER;
      },
      NEXT_REWRITTEN_QUERY_HEADER: function() {
        return NEXT_REWRITTEN_QUERY_HEADER;
      },
      NEXT_ROUTER_PREFETCH_HEADER: function() {
        return NEXT_ROUTER_PREFETCH_HEADER;
      },
      NEXT_ROUTER_SEGMENT_PREFETCH_HEADER: function() {
        return NEXT_ROUTER_SEGMENT_PREFETCH_HEADER;
      },
      NEXT_ROUTER_STALE_TIME_HEADER: function() {
        return NEXT_ROUTER_STALE_TIME_HEADER;
      },
      NEXT_ROUTER_STATE_TREE_HEADER: function() {
        return NEXT_ROUTER_STATE_TREE_HEADER;
      },
      NEXT_RSC_UNION_QUERY: function() {
        return NEXT_RSC_UNION_QUERY;
      },
      NEXT_URL: function() {
        return NEXT_URL;
      },
      RSC_CONTENT_TYPE_HEADER: function() {
        return RSC_CONTENT_TYPE_HEADER;
      },
      RSC_HEADER: function() {
        return RSC_HEADER;
      }
    });
    var RSC_HEADER = "rsc";
    var ACTION_HEADER = "next-action";
    var NEXT_ROUTER_STATE_TREE_HEADER = "next-router-state-tree";
    var NEXT_ROUTER_PREFETCH_HEADER = "next-router-prefetch";
    var NEXT_ROUTER_SEGMENT_PREFETCH_HEADER = "next-router-segment-prefetch";
    var NEXT_HMR_REFRESH_HEADER = "next-hmr-refresh";
    var NEXT_HMR_REFRESH_HASH_COOKIE = "__next_hmr_refresh_hash__";
    var NEXT_URL = "next-url";
    var RSC_CONTENT_TYPE_HEADER = "text/x-component";
    var NEXT_INSTANT_PREFETCH_HEADER = "next-instant-navigation-testing-prefetch";
    var NEXT_INSTANT_TEST_COOKIE = "next-instant-navigation-testing";
    var FLIGHT_HEADERS = [
      RSC_HEADER,
      NEXT_ROUTER_STATE_TREE_HEADER,
      NEXT_ROUTER_PREFETCH_HEADER,
      NEXT_HMR_REFRESH_HEADER,
      NEXT_ROUTER_SEGMENT_PREFETCH_HEADER
    ];
    var NEXT_RSC_UNION_QUERY = "_rsc";
    var NEXT_ROUTER_STALE_TIME_HEADER = "x-nextjs-stale-time";
    var NEXT_DID_POSTPONE_HEADER = "x-nextjs-postponed";
    var NEXT_REWRITTEN_PATH_HEADER = "x-nextjs-rewritten-path";
    var NEXT_REWRITTEN_QUERY_HEADER = "x-nextjs-rewritten-query";
    var NEXT_IS_PRERENDER_HEADER = "x-nextjs-prerender";
    var NEXT_ACTION_NOT_FOUND_HEADER = "x-nextjs-action-not-found";
    var NEXT_REQUEST_ID_HEADER = "x-nextjs-request-id";
    var NEXT_HTML_REQUEST_ID_HEADER = "x-nextjs-html-request-id";
    var NEXT_ACTION_REVALIDATED_HEADER = "x-action-revalidated";
    if ((typeof exports2.default === "function" || typeof exports2.default === "object" && exports2.default !== null) && typeof exports2.default.__esModule === "undefined") {
      Object.defineProperty(exports2.default, "__esModule", { value: true });
      Object.assign(exports2.default, exports2);
      module2.exports = exports2.default;
    }
  }
});

// node_modules/next/dist/shared/lib/invariant-error.js
var require_invariant_error = __commonJS({
  "node_modules/next/dist/shared/lib/invariant-error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "InvariantError", {
      enumerable: true,
      get: function() {
        return InvariantError;
      }
    });
    var InvariantError = class extends Error {
      constructor(message3, options) {
        super(`Invariant: ${message3.endsWith(".") ? message3 : message3 + "."} This is a bug in Next.js.`, options);
        this.name = "InvariantError";
      }
    };
  }
});

// node_modules/next/dist/shared/lib/promise-with-resolvers.js
var require_promise_with_resolvers = __commonJS({
  "node_modules/next/dist/shared/lib/promise-with-resolvers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "createPromiseWithResolvers", {
      enumerable: true,
      get: function() {
        return createPromiseWithResolvers;
      }
    });
    function createPromiseWithResolvers() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return {
        resolve,
        reject,
        promise
      };
    }
  }
});

// node_modules/next/dist/server/app-render/staged-rendering.js
var require_staged_rendering = __commonJS({
  "node_modules/next/dist/server/app-render/staged-rendering.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      RenderStage: function() {
        return RenderStage;
      },
      StagedRenderingController: function() {
        return StagedRenderingController;
      }
    });
    var _invarianterror = require_invariant_error();
    var _promisewithresolvers = require_promise_with_resolvers();
    var RenderStage = /* @__PURE__ */ (function(RenderStage2) {
      RenderStage2[RenderStage2["Before"] = 1] = "Before";
      RenderStage2[RenderStage2["EarlyStatic"] = 2] = "EarlyStatic";
      RenderStage2[RenderStage2["Static"] = 3] = "Static";
      RenderStage2[RenderStage2["EarlyRuntime"] = 4] = "EarlyRuntime";
      RenderStage2[RenderStage2["Runtime"] = 5] = "Runtime";
      RenderStage2[RenderStage2["Dynamic"] = 6] = "Dynamic";
      RenderStage2[RenderStage2["Abandoned"] = 7] = "Abandoned";
      return RenderStage2;
    })({});
    var StagedRenderingController = class {
      constructor(abortSignal, abandonController, shouldTrackSyncIO) {
        this.abortSignal = abortSignal;
        this.abandonController = abandonController;
        this.shouldTrackSyncIO = shouldTrackSyncIO;
        this.currentStage = 1;
        this.syncInterruptReason = null;
        this.staticStageEndTime = Infinity;
        this.runtimeStageEndTime = Infinity;
        this.staticStageListeners = [];
        this.earlyRuntimeStageListeners = [];
        this.runtimeStageListeners = [];
        this.dynamicStageListeners = [];
        this.staticStagePromise = (0, _promisewithresolvers.createPromiseWithResolvers)();
        this.earlyRuntimeStagePromise = (0, _promisewithresolvers.createPromiseWithResolvers)();
        this.runtimeStagePromise = (0, _promisewithresolvers.createPromiseWithResolvers)();
        this.dynamicStagePromise = (0, _promisewithresolvers.createPromiseWithResolvers)();
        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            const { reason } = abortSignal;
            this.staticStagePromise.promise.catch(ignoreReject);
            this.staticStagePromise.reject(reason);
            this.earlyRuntimeStagePromise.promise.catch(ignoreReject);
            this.earlyRuntimeStagePromise.reject(reason);
            this.runtimeStagePromise.promise.catch(ignoreReject);
            this.runtimeStagePromise.reject(reason);
            this.dynamicStagePromise.promise.catch(ignoreReject);
            this.dynamicStagePromise.reject(reason);
          }, {
            once: true
          });
        }
        if (abandonController) {
          abandonController.signal.addEventListener("abort", () => {
            this.abandonRender();
          }, {
            once: true
          });
        }
      }
      onStage(stage, callback) {
        if (this.currentStage >= stage) {
          callback();
        } else if (stage === 3) {
          this.staticStageListeners.push(callback);
        } else if (stage === 4) {
          this.earlyRuntimeStageListeners.push(callback);
        } else if (stage === 5) {
          this.runtimeStageListeners.push(callback);
        } else if (stage === 6) {
          this.dynamicStageListeners.push(callback);
        } else {
          throw Object.defineProperty(new _invarianterror.InvariantError(`Invalid render stage: ${stage}`), "__NEXT_ERROR_CODE", {
            value: "E881",
            enumerable: false,
            configurable: true
          });
        }
      }
      shouldTrackSyncInterrupt() {
        if (!this.shouldTrackSyncIO) {
          return false;
        }
        switch (this.currentStage) {
          case 1:
            return false;
          case 2:
          case 3:
            return true;
          case 4:
            return true;
          case 5:
            return false;
          case 6:
          case 7:
            return false;
          default:
            return false;
        }
      }
      syncInterruptCurrentStageWithReason(reason) {
        if (this.currentStage === 1) {
          return;
        }
        if (this.currentStage === 7) {
          return;
        }
        if (this.abandonController) {
          this.abandonController.abort();
          return;
        }
        if (this.abortSignal) {
          this.syncInterruptReason = reason;
          this.currentStage = 7;
          return;
        }
        switch (this.currentStage) {
          case 2:
          case 3:
          case 4: {
            this.syncInterruptReason = reason;
            this.advanceStage(6);
            return;
          }
          case 5: {
            return;
          }
          case 6:
          default:
        }
      }
      getSyncInterruptReason() {
        return this.syncInterruptReason;
      }
      getStaticStageEndTime() {
        return this.staticStageEndTime;
      }
      getRuntimeStageEndTime() {
        return this.runtimeStageEndTime;
      }
      abandonRender() {
        const { currentStage } = this;
        switch (currentStage) {
          case 2: {
            this.resolveStaticStage();
          }
          // intentional fallthrough
          case 3: {
            this.resolveEarlyRuntimeStage();
          }
          // intentional fallthrough
          case 4: {
            this.resolveRuntimeStage();
          }
          // intentional fallthrough
          case 5: {
            this.currentStage = 7;
            return;
          }
          case 6:
          case 1:
          case 7:
            break;
          default: {
            currentStage;
          }
        }
      }
      advanceStage(stage) {
        if (stage <= this.currentStage) {
          return;
        }
        let currentStage = this.currentStage;
        this.currentStage = stage;
        if (currentStage < 3 && stage >= 3) {
          this.resolveStaticStage();
        }
        if (currentStage < 4 && stage >= 4) {
          this.resolveEarlyRuntimeStage();
        }
        if (currentStage < 5 && stage >= 5) {
          this.staticStageEndTime = performance.now() + performance.timeOrigin;
          this.resolveRuntimeStage();
        }
        if (currentStage < 6 && stage >= 6) {
          this.runtimeStageEndTime = performance.now() + performance.timeOrigin;
          this.resolveDynamicStage();
          return;
        }
      }
      /** Fire the `onStage` listeners for the static stage and unblock any promises waiting for it. */
      resolveStaticStage() {
        const staticListeners = this.staticStageListeners;
        for (let i = 0; i < staticListeners.length; i++) {
          staticListeners[i]();
        }
        staticListeners.length = 0;
        this.staticStagePromise.resolve();
      }
      /** Fire the `onStage` listeners for the early runtime stage and unblock any promises waiting for it. */
      resolveEarlyRuntimeStage() {
        const earlyRuntimeListeners = this.earlyRuntimeStageListeners;
        for (let i = 0; i < earlyRuntimeListeners.length; i++) {
          earlyRuntimeListeners[i]();
        }
        earlyRuntimeListeners.length = 0;
        this.earlyRuntimeStagePromise.resolve();
      }
      /** Fire the `onStage` listeners for the runtime stage and unblock any promises waiting for it. */
      resolveRuntimeStage() {
        const runtimeListeners = this.runtimeStageListeners;
        for (let i = 0; i < runtimeListeners.length; i++) {
          runtimeListeners[i]();
        }
        runtimeListeners.length = 0;
        this.runtimeStagePromise.resolve();
      }
      /** Fire the `onStage` listeners for the dynamic stage and unblock any promises waiting for it. */
      resolveDynamicStage() {
        const dynamicListeners = this.dynamicStageListeners;
        for (let i = 0; i < dynamicListeners.length; i++) {
          dynamicListeners[i]();
        }
        dynamicListeners.length = 0;
        this.dynamicStagePromise.resolve();
      }
      getStagePromise(stage) {
        switch (stage) {
          case 3: {
            return this.staticStagePromise.promise;
          }
          case 4: {
            return this.earlyRuntimeStagePromise.promise;
          }
          case 5: {
            return this.runtimeStagePromise.promise;
          }
          case 6: {
            return this.dynamicStagePromise.promise;
          }
          default: {
            stage;
            throw Object.defineProperty(new _invarianterror.InvariantError(`Invalid render stage: ${stage}`), "__NEXT_ERROR_CODE", {
              value: "E881",
              enumerable: false,
              configurable: true
            });
          }
        }
      }
      waitForStage(stage) {
        return this.getStagePromise(stage);
      }
      delayUntilStage(stage, displayName, resolvedValue) {
        const ioTriggerPromise = this.getStagePromise(stage);
        const promise = makeDevtoolsIOPromiseFromIOTrigger(ioTriggerPromise, displayName, resolvedValue);
        if (this.abortSignal) {
          promise.catch(ignoreReject);
        }
        return promise;
      }
    };
    function ignoreReject() {
    }
    function makeDevtoolsIOPromiseFromIOTrigger(ioTrigger, displayName, resolvedValue) {
      const promise = new Promise((resolve, reject) => {
        ioTrigger.then(resolve.bind(null, resolvedValue), reject);
      });
      if (displayName !== void 0) {
        promise.displayName = displayName;
      }
      return promise;
    }
  }
});

// node_modules/next/dist/server/app-render/work-unit-async-storage.external.js
var require_work_unit_async_storage_external = __commonJS({
  "node_modules/next/dist/server/app-render/work-unit-async-storage.external.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      getCacheSignal: function() {
        return getCacheSignal;
      },
      getDraftModeProviderForCacheScope: function() {
        return getDraftModeProviderForCacheScope;
      },
      getHmrRefreshHash: function() {
        return getHmrRefreshHash;
      },
      getPrerenderResumeDataCache: function() {
        return getPrerenderResumeDataCache;
      },
      getRenderResumeDataCache: function() {
        return getRenderResumeDataCache;
      },
      getServerComponentsHmrCache: function() {
        return getServerComponentsHmrCache;
      },
      getStagedRenderingController: function() {
        return getStagedRenderingController;
      },
      isHmrRefresh: function() {
        return isHmrRefresh;
      },
      isInEarlyRenderStage: function() {
        return isInEarlyRenderStage;
      },
      throwForMissingRequestStore: function() {
        return throwForMissingRequestStore;
      },
      throwInvariantForMissingStore: function() {
        return throwInvariantForMissingStore;
      },
      workUnitAsyncStorage: function() {
        return _workunitasyncstorageinstance.workUnitAsyncStorageInstance;
      }
    });
    var _workunitasyncstorageinstance = require_work_unit_async_storage_instance();
    var _approuterheaders = require_app_router_headers();
    var _invarianterror = require_invariant_error();
    var _stagedrendering = require_staged_rendering();
    function isInEarlyRenderStage(requestStore) {
      const stagedRendering = requestStore.stagedRendering;
      if (stagedRendering) {
        return stagedRendering.currentStage === _stagedrendering.RenderStage.EarlyStatic || stagedRendering.currentStage === _stagedrendering.RenderStage.EarlyRuntime;
      }
      return false;
    }
    function throwForMissingRequestStore(callingExpression) {
      throw Object.defineProperty(new Error(`\`${callingExpression}\` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", {
        value: "E251",
        enumerable: false,
        configurable: true
      });
    }
    function throwInvariantForMissingStore() {
      throw Object.defineProperty(new _invarianterror.InvariantError("Expected workUnitAsyncStorage to have a store."), "__NEXT_ERROR_CODE", {
        value: "E696",
        enumerable: false,
        configurable: true
      });
    }
    function getPrerenderResumeDataCache(workUnitStore) {
      switch (workUnitStore.type) {
        case "prerender":
        case "prerender-runtime":
        case "prerender-ppr":
          return workUnitStore.prerenderResumeDataCache;
        case "prerender-client":
        case "validation-client":
          return workUnitStore.prerenderResumeDataCache;
        case "request": {
          if (workUnitStore.prerenderResumeDataCache) {
            return workUnitStore.prerenderResumeDataCache;
          }
        }
        case "prerender-legacy":
        case "cache":
        case "private-cache":
        case "unstable-cache":
        case "generate-static-params":
          return null;
        default:
          return workUnitStore;
      }
    }
    function getRenderResumeDataCache(workUnitStore) {
      switch (workUnitStore.type) {
        case "request":
        case "prerender":
        case "prerender-runtime":
        case "prerender-client":
        case "validation-client":
          if (workUnitStore.renderResumeDataCache) {
            return workUnitStore.renderResumeDataCache;
          }
        // fallthrough
        case "prerender-ppr":
          return workUnitStore.prerenderResumeDataCache ?? null;
        case "cache":
        case "private-cache":
        case "unstable-cache":
        case "prerender-legacy":
        case "generate-static-params":
          return null;
        default:
          return workUnitStore;
      }
    }
    function getHmrRefreshHash(workUnitStore) {
      if (process.env.__NEXT_DEV_SERVER) {
        switch (workUnitStore.type) {
          case "cache":
          case "private-cache":
          case "prerender":
          case "prerender-runtime":
            return workUnitStore.hmrRefreshHash;
          case "request":
            var _workUnitStore_cookies_get;
            return (_workUnitStore_cookies_get = workUnitStore.cookies.get(_approuterheaders.NEXT_HMR_REFRESH_HASH_COOKIE)) == null ? void 0 : _workUnitStore_cookies_get.value;
          case "prerender-client":
          case "validation-client":
          case "prerender-ppr":
          case "prerender-legacy":
          case "unstable-cache":
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
      return void 0;
    }
    function isHmrRefresh(workUnitStore) {
      if (process.env.__NEXT_DEV_SERVER) {
        switch (workUnitStore.type) {
          case "cache":
          case "private-cache":
          case "request":
            return workUnitStore.isHmrRefresh ?? false;
          case "prerender":
          case "prerender-client":
          case "validation-client":
          case "prerender-runtime":
          case "prerender-ppr":
          case "prerender-legacy":
          case "unstable-cache":
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
      return false;
    }
    function getServerComponentsHmrCache(workUnitStore) {
      if (process.env.__NEXT_DEV_SERVER) {
        switch (workUnitStore.type) {
          case "cache":
          case "private-cache":
          case "request":
            return workUnitStore.serverComponentsHmrCache;
          case "prerender":
          case "prerender-client":
          case "validation-client":
          case "prerender-runtime":
          case "prerender-ppr":
          case "prerender-legacy":
          case "unstable-cache":
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
      return void 0;
    }
    function getDraftModeProviderForCacheScope(workStore, workUnitStore) {
      if (workStore.isDraftMode) {
        switch (workUnitStore.type) {
          case "cache":
          case "private-cache":
          case "unstable-cache":
          case "prerender-runtime":
          case "request":
            return workUnitStore.draftMode;
          case "prerender":
          case "prerender-client":
          case "validation-client":
          case "prerender-ppr":
          case "prerender-legacy":
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
      return void 0;
    }
    function getStagedRenderingController(workUnitStore) {
      switch (workUnitStore.type) {
        case "request":
        case "prerender-runtime":
          return workUnitStore.stagedRendering ?? null;
        case "prerender":
        case "prerender-client":
        case "validation-client":
        case "prerender-ppr":
        case "prerender-legacy":
        case "cache":
        case "private-cache":
        case "unstable-cache":
        case "generate-static-params":
          return null;
        default:
          return workUnitStore;
      }
    }
    function getCacheSignal(workUnitStore) {
      switch (workUnitStore.type) {
        case "prerender":
        case "prerender-client":
        case "validation-client":
        case "prerender-runtime":
          return workUnitStore.cacheSignal;
        case "request": {
          if (workUnitStore.cacheSignal) {
            return workUnitStore.cacheSignal;
          }
        }
        case "prerender-ppr":
        case "prerender-legacy":
        case "cache":
        case "private-cache":
        case "unstable-cache":
        case "generate-static-params":
          return null;
        default:
          return workUnitStore;
      }
    }
  }
});

// node_modules/react/cjs/react.production.js
var require_react_production = __commonJS({
  "node_modules/react/cjs/react.production.js"(exports2) {
    "use strict";
    var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element");
    var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
    var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
    var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
    var REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer");
    var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
    var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
    var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
    var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
    var REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
      maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    var ReactNoopUpdateQueue = {
      isMounted: function() {
        return false;
      },
      enqueueForceUpdate: function() {
      },
      enqueueReplaceState: function() {
      },
      enqueueSetState: function() {
      }
    };
    var assign = Object.assign;
    var emptyObject = {};
    function Component(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    Component.prototype.isReactComponent = {};
    Component.prototype.setState = function(partialState, callback) {
      if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
        throw Error(
          "takes an object of state variables to update or a function which returns an object of state variables."
        );
      this.updater.enqueueSetState(this, partialState, callback, "setState");
    };
    Component.prototype.forceUpdate = function(callback) {
      this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
    };
    function ComponentDummy() {
    }
    ComponentDummy.prototype = Component.prototype;
    function PureComponent(props, context, updater) {
      this.props = props;
      this.context = context;
      this.refs = emptyObject;
      this.updater = updater || ReactNoopUpdateQueue;
    }
    var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
    pureComponentPrototype.constructor = PureComponent;
    assign(pureComponentPrototype, Component.prototype);
    pureComponentPrototype.isPureReactComponent = true;
    var isArrayImpl = Array.isArray;
    function noop() {
    }
    var ReactSharedInternals = { H: null, A: null, T: null, S: null };
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function ReactElement(type, key2, props) {
      var refProp = props.ref;
      return {
        $$typeof: REACT_ELEMENT_TYPE,
        type,
        key: key2,
        ref: void 0 !== refProp ? refProp : null,
        props
      };
    }
    function cloneAndReplaceKey(oldElement, newKey) {
      return ReactElement(oldElement.type, newKey, oldElement.props);
    }
    function isValidElement(object) {
      return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    function escape(key2) {
      var escaperLookup = { "=": "=0", ":": "=2" };
      return "$" + key2.replace(/[=:]/g, function(match2) {
        return escaperLookup[match2];
      });
    }
    var userProvidedKeyEscapeRegex = /\/+/g;
    function getElementKey(element, index) {
      return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
    }
    function resolveThenable(thenable) {
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenable.reason;
        default:
          switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
            function(fulfilledValue) {
              "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
            },
            function(error) {
              "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
            }
          )), thenable.status) {
            case "fulfilled":
              return thenable.value;
            case "rejected":
              throw thenable.reason;
          }
      }
      throw thenable;
    }
    function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
      var type = typeof children;
      if ("undefined" === type || "boolean" === type) children = null;
      var invokeCallback = false;
      if (null === children) invokeCallback = true;
      else
        switch (type) {
          case "bigint":
          case "string":
          case "number":
            invokeCallback = true;
            break;
          case "object":
            switch (children.$$typeof) {
              case REACT_ELEMENT_TYPE:
              case REACT_PORTAL_TYPE:
                invokeCallback = true;
                break;
              case REACT_LAZY_TYPE:
                return invokeCallback = children._init, mapIntoArray(
                  invokeCallback(children._payload),
                  array,
                  escapedPrefix,
                  nameSoFar,
                  callback
                );
            }
        }
      if (invokeCallback)
        return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
          return c;
        })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
          callback,
          escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
            userProvidedKeyEscapeRegex,
            "$&/"
          ) + "/") + invokeCallback
        )), array.push(callback)), 1;
      invokeCallback = 0;
      var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
      if (isArrayImpl(children))
        for (var i = 0; i < children.length; i++)
          nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if (i = getIteratorFn(children), "function" === typeof i)
        for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
          nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
            nameSoFar,
            array,
            escapedPrefix,
            type,
            callback
          );
      else if ("object" === type) {
        if ("function" === typeof children.then)
          return mapIntoArray(
            resolveThenable(children),
            array,
            escapedPrefix,
            nameSoFar,
            callback
          );
        array = String(children);
        throw Error(
          "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
        );
      }
      return invokeCallback;
    }
    function mapChildren(children, func, context) {
      if (null == children) return children;
      var result = [], count = 0;
      mapIntoArray(children, result, "", "", function(child) {
        return func.call(context, child, count++);
      });
      return result;
    }
    function lazyInitializer(payload) {
      if (-1 === payload._status) {
        var ctor = payload._result;
        ctor = ctor();
        ctor.then(
          function(moduleObject) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 1, payload._result = moduleObject;
          },
          function(error) {
            if (0 === payload._status || -1 === payload._status)
              payload._status = 2, payload._result = error;
          }
        );
        -1 === payload._status && (payload._status = 0, payload._result = ctor);
      }
      if (1 === payload._status) return payload._result.default;
      throw payload._result;
    }
    var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
      if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
        var event = new window.ErrorEvent("error", {
          bubbles: true,
          cancelable: true,
          message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
          error
        });
        if (!window.dispatchEvent(event)) return;
      } else if ("object" === typeof process && "function" === typeof process.emit) {
        process.emit("uncaughtException", error);
        return;
      }
      console.error(error);
    };
    var Children = {
      map: mapChildren,
      forEach: function(children, forEachFunc, forEachContext) {
        mapChildren(
          children,
          function() {
            forEachFunc.apply(this, arguments);
          },
          forEachContext
        );
      },
      count: function(children) {
        var n = 0;
        mapChildren(children, function() {
          n++;
        });
        return n;
      },
      toArray: function(children) {
        return mapChildren(children, function(child) {
          return child;
        }) || [];
      },
      only: function(children) {
        if (!isValidElement(children))
          throw Error(
            "React.Children.only expected to receive a single React element child."
          );
        return children;
      }
    };
    exports2.Activity = REACT_ACTIVITY_TYPE;
    exports2.Children = Children;
    exports2.Component = Component;
    exports2.Fragment = REACT_FRAGMENT_TYPE;
    exports2.Profiler = REACT_PROFILER_TYPE;
    exports2.PureComponent = PureComponent;
    exports2.StrictMode = REACT_STRICT_MODE_TYPE;
    exports2.Suspense = REACT_SUSPENSE_TYPE;
    exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
    exports2.__COMPILER_RUNTIME = {
      __proto__: null,
      c: function(size) {
        return ReactSharedInternals.H.useMemoCache(size);
      }
    };
    exports2.cache = function(fn) {
      return function() {
        return fn.apply(null, arguments);
      };
    };
    exports2.cacheSignal = function() {
      return null;
    };
    exports2.cloneElement = function(element, config, children) {
      if (null === element || void 0 === element)
        throw Error(
          "The argument must be a React element, but you passed " + element + "."
        );
      var props = assign({}, element.props), key2 = element.key;
      if (null != config)
        for (propName in void 0 !== config.key && (key2 = "" + config.key), config)
          !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
      var propName = arguments.length - 2;
      if (1 === propName) props.children = children;
      else if (1 < propName) {
        for (var childArray = Array(propName), i = 0; i < propName; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      return ReactElement(element.type, key2, props);
    };
    exports2.createContext = function(defaultValue) {
      defaultValue = {
        $$typeof: REACT_CONTEXT_TYPE,
        _currentValue: defaultValue,
        _currentValue2: defaultValue,
        _threadCount: 0,
        Provider: null,
        Consumer: null
      };
      defaultValue.Provider = defaultValue;
      defaultValue.Consumer = {
        $$typeof: REACT_CONSUMER_TYPE,
        _context: defaultValue
      };
      return defaultValue;
    };
    exports2.createElement = function(type, config, children) {
      var propName, props = {}, key2 = null;
      if (null != config)
        for (propName in void 0 !== config.key && (key2 = "" + config.key), config)
          hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
      var childrenLength = arguments.length - 2;
      if (1 === childrenLength) props.children = children;
      else if (1 < childrenLength) {
        for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
          childArray[i] = arguments[i + 2];
        props.children = childArray;
      }
      if (type && type.defaultProps)
        for (propName in childrenLength = type.defaultProps, childrenLength)
          void 0 === props[propName] && (props[propName] = childrenLength[propName]);
      return ReactElement(type, key2, props);
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(render) {
      return { $$typeof: REACT_FORWARD_REF_TYPE, render };
    };
    exports2.isValidElement = isValidElement;
    exports2.lazy = function(ctor) {
      return {
        $$typeof: REACT_LAZY_TYPE,
        _payload: { _status: -1, _result: ctor },
        _init: lazyInitializer
      };
    };
    exports2.memo = function(type, compare) {
      return {
        $$typeof: REACT_MEMO_TYPE,
        type,
        compare: void 0 === compare ? null : compare
      };
    };
    exports2.startTransition = function(scope) {
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      ReactSharedInternals.T = currentTransition;
      try {
        var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
        null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
      } catch (error) {
        reportGlobalError(error);
      } finally {
        null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
      }
    };
    exports2.unstable_useCacheRefresh = function() {
      return ReactSharedInternals.H.useCacheRefresh();
    };
    exports2.use = function(usable) {
      return ReactSharedInternals.H.use(usable);
    };
    exports2.useActionState = function(action, initialState, permalink) {
      return ReactSharedInternals.H.useActionState(action, initialState, permalink);
    };
    exports2.useCallback = function(callback, deps) {
      return ReactSharedInternals.H.useCallback(callback, deps);
    };
    exports2.useContext = function(Context) {
      return ReactSharedInternals.H.useContext(Context);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(value, initialValue) {
      return ReactSharedInternals.H.useDeferredValue(value, initialValue);
    };
    exports2.useEffect = function(create, deps) {
      return ReactSharedInternals.H.useEffect(create, deps);
    };
    exports2.useEffectEvent = function(callback) {
      return ReactSharedInternals.H.useEffectEvent(callback);
    };
    exports2.useId = function() {
      return ReactSharedInternals.H.useId();
    };
    exports2.useImperativeHandle = function(ref, create, deps) {
      return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
    };
    exports2.useInsertionEffect = function(create, deps) {
      return ReactSharedInternals.H.useInsertionEffect(create, deps);
    };
    exports2.useLayoutEffect = function(create, deps) {
      return ReactSharedInternals.H.useLayoutEffect(create, deps);
    };
    exports2.useMemo = function(create, deps) {
      return ReactSharedInternals.H.useMemo(create, deps);
    };
    exports2.useOptimistic = function(passthrough, reducer) {
      return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
    };
    exports2.useReducer = function(reducer, initialArg, init) {
      return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
    };
    exports2.useRef = function(initialValue) {
      return ReactSharedInternals.H.useRef(initialValue);
    };
    exports2.useState = function(initialState) {
      return ReactSharedInternals.H.useState(initialState);
    };
    exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
      return ReactSharedInternals.H.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
    };
    exports2.useTransition = function() {
      return ReactSharedInternals.H.useTransition();
    };
    exports2.version = "19.2.1";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    "production" !== process.env.NODE_ENV && (function() {
      function defineDeprecationWarning(methodName, info) {
        Object.defineProperty(Component.prototype, methodName, {
          get: function() {
            console.warn(
              "%s(...) is deprecated in plain JavaScript React classes. %s",
              info[0],
              info[1]
            );
          }
        });
      }
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable)
          return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      function warnNoop(publicInstance, callerName) {
        publicInstance = (publicInstance = publicInstance.constructor) && (publicInstance.displayName || publicInstance.name) || "ReactClass";
        var warningKey = publicInstance + "." + callerName;
        didWarnStateUpdateForUnmountedComponent[warningKey] || (console.error(
          "Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.",
          callerName,
          publicInstance
        ), didWarnStateUpdateForUnmountedComponent[warningKey] = true);
      }
      function Component(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function ComponentDummy() {
      }
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      function noop() {
      }
      function testStringCoercion(value) {
        return "" + value;
      }
      function checkKeyStringCoercion(value) {
        try {
          testStringCoercion(value);
          var JSCompiler_inline_result = false;
        } catch (e) {
          JSCompiler_inline_result = true;
        }
        if (JSCompiler_inline_result) {
          JSCompiler_inline_result = console;
          var JSCompiler_temp_const = JSCompiler_inline_result.error;
          var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
          JSCompiler_temp_const.call(
            JSCompiler_inline_result,
            "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.",
            JSCompiler_inline_result$jscomp$0
          );
          return testStringCoercion(value);
        }
      }
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch ("number" === typeof type.tag && console.error(
            "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
          ), type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE)
          return "<...>";
        try {
          var name = getComponentNameFromType(type);
          return name ? "<" + name + ">" : "<...>";
        } catch (x) {
          return "<...>";
        }
      }
      function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
      }
      function UnknownOwner() {
        return Error("react-stack-top-frame");
      }
      function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
          var getter = Object.getOwnPropertyDescriptor(config, "key").get;
          if (getter && getter.isReactWarning) return false;
        }
        return void 0 !== config.key;
      }
      function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
          specialPropKeyWarningShown || (specialPropKeyWarningShown = true, console.error(
            "%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)",
            displayName
          ));
        }
        warnAboutAccessingKey.isReactWarning = true;
        Object.defineProperty(props, "key", {
          get: warnAboutAccessingKey,
          configurable: true
        });
      }
      function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = true, console.error(
          "Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."
        ));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
      }
      function ReactElement(type, key2, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key: key2,
          props,
          _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
          enumerable: false,
          get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", { enumerable: false, value: null });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: null
        });
        Object.defineProperty(type, "_debugStack", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
          configurable: false,
          enumerable: false,
          writable: true,
          value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        newKey = ReactElement(
          oldElement.type,
          newKey,
          oldElement.props,
          oldElement._owner,
          oldElement._debugStack,
          oldElement._debugTask
        );
        oldElement._store && (newKey._store.validated = oldElement._store.validated);
        return newKey;
      }
      function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key2) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key2.replace(/[=:]/g, function(match2) {
          return escaperLookup[match2];
        });
      }
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? (checkKeyStringCoercion(element.key), escape("" + element.key)) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback) {
          invokeCallback = children;
          callback = callback(invokeCallback);
          var childKey = "" === nameSoFar ? "." + getElementKey(invokeCallback, 0) : nameSoFar;
          isArrayImpl(callback) ? (escapedPrefix = "", null != childKey && (escapedPrefix = childKey.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (null != callback.key && (invokeCallback && invokeCallback.key === callback.key || checkKeyStringCoercion(callback.key)), escapedPrefix = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || invokeCallback && invokeCallback.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + childKey
          ), "" !== nameSoFar && null != invokeCallback && isValidElement(invokeCallback) && null == invokeCallback.key && invokeCallback._store && !invokeCallback._store.validated && (escapedPrefix._store.validated = 2), callback = escapedPrefix), array.push(callback));
          return 1;
        }
        invokeCallback = 0;
        childKey = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = childKey + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (i === children.entries && (didWarnAboutMaps || console.warn(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ), didWarnAboutMaps = true), children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = childKey + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ioInfo = payload._ioInfo;
          null != ioInfo && (ioInfo.start = ioInfo.end = performance.now());
          ioInfo = payload._result;
          var thenable = ioInfo();
          thenable.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 1;
                payload._result = moduleObject;
                var _ioInfo = payload._ioInfo;
                null != _ioInfo && (_ioInfo.end = performance.now());
                void 0 === thenable.status && (thenable.status = "fulfilled", thenable.value = moduleObject);
              }
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status) {
                payload._status = 2;
                payload._result = error;
                var _ioInfo2 = payload._ioInfo;
                null != _ioInfo2 && (_ioInfo2.end = performance.now());
                void 0 === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            }
          );
          ioInfo = payload._ioInfo;
          if (null != ioInfo) {
            ioInfo.value = thenable;
            var displayName = thenable.displayName;
            "string" === typeof displayName && (ioInfo.name = displayName);
          }
          -1 === payload._status && (payload._status = 0, payload._result = thenable);
        }
        if (1 === payload._status)
          return ioInfo = payload._result, void 0 === ioInfo && console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?",
            ioInfo
          ), "default" in ioInfo || console.error(
            "lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))",
            ioInfo
          ), ioInfo.default;
        throw payload._result;
      }
      function resolveDispatcher() {
        var dispatcher = ReactSharedInternals.H;
        null === dispatcher && console.error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
        return dispatcher;
      }
      function releaseAsyncTransition() {
        ReactSharedInternals.asyncTransitions--;
      }
      function enqueueTask(task) {
        if (null === enqueueTaskImpl)
          try {
            var requireString = ("require" + Math.random()).slice(0, 7);
            enqueueTaskImpl = (module2 && module2[requireString]).call(
              module2,
              "timers"
            ).setImmediate;
          } catch (_err) {
            enqueueTaskImpl = function(callback) {
              false === didWarnAboutMessageChannel && (didWarnAboutMessageChannel = true, "undefined" === typeof MessageChannel && console.error(
                "This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning."
              ));
              var channel = new MessageChannel();
              channel.port1.onmessage = callback;
              channel.port2.postMessage(void 0);
            };
          }
        return enqueueTaskImpl(task);
      }
      function aggregateErrors(errors) {
        return 1 < errors.length && "function" === typeof AggregateError ? new AggregateError(errors) : errors[0];
      }
      function popActScope(prevActQueue, prevActScopeDepth) {
        prevActScopeDepth !== actScopeDepth - 1 && console.error(
          "You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. "
        );
        actScopeDepth = prevActScopeDepth;
      }
      function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
        var queue = ReactSharedInternals.actQueue;
        if (null !== queue)
          if (0 !== queue.length)
            try {
              flushActQueue(queue);
              enqueueTask(function() {
                return recursivelyFlushAsyncActWork(returnValue, resolve, reject);
              });
              return;
            } catch (error) {
              ReactSharedInternals.thrownErrors.push(error);
            }
          else ReactSharedInternals.actQueue = null;
        0 < ReactSharedInternals.thrownErrors.length ? (queue = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, reject(queue)) : resolve(returnValue);
      }
      function flushActQueue(queue) {
        if (!isFlushing) {
          isFlushing = true;
          var i = 0;
          try {
            for (; i < queue.length; i++) {
              var callback = queue[i];
              do {
                ReactSharedInternals.didUsePromise = false;
                var continuation = callback(false);
                if (null !== continuation) {
                  if (ReactSharedInternals.didUsePromise) {
                    queue[i] = callback;
                    queue.splice(0, i);
                    return;
                  }
                  callback = continuation;
                } else break;
              } while (1);
            }
            queue.length = 0;
          } catch (error) {
            queue.splice(0, i + 1), ReactSharedInternals.thrownErrors.push(error);
          } finally {
            isFlushing = false;
          }
        }
      }
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
      var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = /* @__PURE__ */ Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo"), REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = /* @__PURE__ */ Symbol.for("react.activity"), MAYBE_ITERATOR_SYMBOL = Symbol.iterator, didWarnStateUpdateForUnmountedComponent = {}, ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function(publicInstance) {
          warnNoop(publicInstance, "forceUpdate");
        },
        enqueueReplaceState: function(publicInstance) {
          warnNoop(publicInstance, "replaceState");
        },
        enqueueSetState: function(publicInstance) {
          warnNoop(publicInstance, "setState");
        }
      }, assign = Object.assign, emptyObject = {};
      Object.freeze(emptyObject);
      Component.prototype.isReactComponent = {};
      Component.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      var deprecatedAPIs = {
        isMounted: [
          "isMounted",
          "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."
        ],
        replaceState: [
          "replaceState",
          "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."
        ]
      };
      for (fnName in deprecatedAPIs)
        deprecatedAPIs.hasOwnProperty(fnName) && defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
      ComponentDummy.prototype = Component.prototype;
      deprecatedAPIs = PureComponent.prototype = new ComponentDummy();
      deprecatedAPIs.constructor = PureComponent;
      assign(deprecatedAPIs, Component.prototype);
      deprecatedAPIs.isPureReactComponent = true;
      var isArrayImpl = Array.isArray, REACT_CLIENT_REFERENCE = /* @__PURE__ */ Symbol.for("react.client.reference"), ReactSharedInternals = {
        H: null,
        A: null,
        T: null,
        S: null,
        actQueue: null,
        asyncTransitions: 0,
        isBatchingLegacy: false,
        didScheduleLegacyUpdate: false,
        didUsePromise: false,
        thrownErrors: [],
        getCurrentStack: null,
        recentlyCreatedOwnerStacks: 0
      }, hasOwnProperty = Object.prototype.hasOwnProperty, createTask = console.createTask ? console.createTask : function() {
        return null;
      };
      deprecatedAPIs = {
        react_stack_bottom_frame: function(callStackForError) {
          return callStackForError();
        }
      };
      var specialPropKeyWarningShown, didWarnAboutOldJSXRuntime;
      var didWarnAboutElementRef = {};
      var unknownOwnerDebugStack = deprecatedAPIs.react_stack_bottom_frame.bind(
        deprecatedAPIs,
        UnknownOwner
      )();
      var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
      var didWarnAboutMaps = false, userProvidedKeyEscapeRegex = /\/+/g, reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      }, didWarnAboutMessageChannel = false, enqueueTaskImpl = null, actScopeDepth = 0, didWarnNoAwaitAct = false, isFlushing = false, queueSeveralMicrotasks = "function" === typeof queueMicrotask ? function(callback) {
        queueMicrotask(function() {
          return queueMicrotask(callback);
        });
      } : enqueueTask;
      deprecatedAPIs = Object.freeze({
        __proto__: null,
        c: function(size) {
          return resolveDispatcher().useMemoCache(size);
        }
      });
      var fnName = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports2.Activity = REACT_ACTIVITY_TYPE;
      exports2.Children = fnName;
      exports2.Component = Component;
      exports2.Fragment = REACT_FRAGMENT_TYPE;
      exports2.Profiler = REACT_PROFILER_TYPE;
      exports2.PureComponent = PureComponent;
      exports2.StrictMode = REACT_STRICT_MODE_TYPE;
      exports2.Suspense = REACT_SUSPENSE_TYPE;
      exports2.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports2.__COMPILER_RUNTIME = deprecatedAPIs;
      exports2.act = function(callback) {
        var prevActQueue = ReactSharedInternals.actQueue, prevActScopeDepth = actScopeDepth;
        actScopeDepth++;
        var queue = ReactSharedInternals.actQueue = null !== prevActQueue ? prevActQueue : [], didAwaitActCall = false;
        try {
          var result = callback();
        } catch (error) {
          ReactSharedInternals.thrownErrors.push(error);
        }
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw popActScope(prevActQueue, prevActScopeDepth), callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        if (null !== result && "object" === typeof result && "function" === typeof result.then) {
          var thenable = result;
          queueSeveralMicrotasks(function() {
            didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
              "You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);"
            ));
          });
          return {
            then: function(resolve, reject) {
              didAwaitActCall = true;
              thenable.then(
                function(returnValue) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  if (0 === prevActScopeDepth) {
                    try {
                      flushActQueue(queue), enqueueTask(function() {
                        return recursivelyFlushAsyncActWork(
                          returnValue,
                          resolve,
                          reject
                        );
                      });
                    } catch (error$0) {
                      ReactSharedInternals.thrownErrors.push(error$0);
                    }
                    if (0 < ReactSharedInternals.thrownErrors.length) {
                      var _thrownError = aggregateErrors(
                        ReactSharedInternals.thrownErrors
                      );
                      ReactSharedInternals.thrownErrors.length = 0;
                      reject(_thrownError);
                    }
                  } else resolve(returnValue);
                },
                function(error) {
                  popActScope(prevActQueue, prevActScopeDepth);
                  0 < ReactSharedInternals.thrownErrors.length ? (error = aggregateErrors(
                    ReactSharedInternals.thrownErrors
                  ), ReactSharedInternals.thrownErrors.length = 0, reject(error)) : reject(error);
                }
              );
            }
          };
        }
        var returnValue$jscomp$0 = result;
        popActScope(prevActQueue, prevActScopeDepth);
        0 === prevActScopeDepth && (flushActQueue(queue), 0 !== queue.length && queueSeveralMicrotasks(function() {
          didAwaitActCall || didWarnNoAwaitAct || (didWarnNoAwaitAct = true, console.error(
            "A component suspended inside an `act` scope, but the `act` call was not awaited. When testing React components that depend on asynchronous data, you must await the result:\n\nawait act(() => ...)"
          ));
        }), ReactSharedInternals.actQueue = null);
        if (0 < ReactSharedInternals.thrownErrors.length)
          throw callback = aggregateErrors(ReactSharedInternals.thrownErrors), ReactSharedInternals.thrownErrors.length = 0, callback;
        return {
          then: function(resolve, reject) {
            didAwaitActCall = true;
            0 === prevActScopeDepth ? (ReactSharedInternals.actQueue = queue, enqueueTask(function() {
              return recursivelyFlushAsyncActWork(
                returnValue$jscomp$0,
                resolve,
                reject
              );
            })) : resolve(returnValue$jscomp$0);
          }
        };
      };
      exports2.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports2.cacheSignal = function() {
        return null;
      };
      exports2.captureOwnerStack = function() {
        var getCurrentStack = ReactSharedInternals.getCurrentStack;
        return null === getCurrentStack ? null : getCurrentStack();
      };
      exports2.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key2 = element.key, owner = element._owner;
        if (null != config) {
          var JSCompiler_inline_result;
          a: {
            if (hasOwnProperty.call(config, "ref") && (JSCompiler_inline_result = Object.getOwnPropertyDescriptor(
              config,
              "ref"
            ).get) && JSCompiler_inline_result.isReactWarning) {
              JSCompiler_inline_result = false;
              break a;
            }
            JSCompiler_inline_result = void 0 !== config.ref;
          }
          JSCompiler_inline_result && (owner = getOwner());
          hasValidKey(config) && (checkKeyStringCoercion(config.key), key2 = "" + config.key);
          for (propName in config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        }
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          JSCompiler_inline_result = Array(propName);
          for (var i = 0; i < propName; i++)
            JSCompiler_inline_result[i] = arguments[i + 2];
          props.children = JSCompiler_inline_result;
        }
        props = ReactElement(
          element.type,
          key2,
          props,
          owner,
          element._debugStack,
          element._debugTask
        );
        for (key2 = 2; key2 < arguments.length; key2++)
          validateChildKeys(arguments[key2]);
        return props;
      };
      exports2.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        defaultValue._currentRenderer = null;
        defaultValue._currentRenderer2 = null;
        return defaultValue;
      };
      exports2.createElement = function(type, config, children) {
        for (var i = 2; i < arguments.length; i++)
          validateChildKeys(arguments[i]);
        i = {};
        var key2 = null;
        if (null != config)
          for (propName in didWarnAboutOldJSXRuntime || !("__self" in config) || "key" in config || (didWarnAboutOldJSXRuntime = true, console.warn(
            "Your app (or one of its dependencies) is using an outdated JSX transform. Update to the modern JSX transform for faster performance: https://react.dev/link/new-jsx-transform"
          )), hasValidKey(config) && (checkKeyStringCoercion(config.key), key2 = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (i[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) i.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), _i = 0; _i < childrenLength; _i++)
            childArray[_i] = arguments[_i + 2];
          Object.freeze && Object.freeze(childArray);
          i.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === i[propName] && (i[propName] = childrenLength[propName]);
        key2 && defineKeyPropWarningGetter(
          i,
          "function" === typeof type ? type.displayName || type.name || "Unknown" : type
        );
        var propName = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        return ReactElement(
          type,
          key2,
          i,
          getOwner(),
          propName ? Error("react-stack-top-frame") : unknownOwnerDebugStack,
          propName ? createTask(getTaskName(type)) : unknownOwnerDebugTask
        );
      };
      exports2.createRef = function() {
        var refObject = { current: null };
        Object.seal(refObject);
        return refObject;
      };
      exports2.forwardRef = function(render) {
        null != render && render.$$typeof === REACT_MEMO_TYPE ? console.error(
          "forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...))."
        ) : "function" !== typeof render ? console.error(
          "forwardRef requires a render function but was given %s.",
          null === render ? "null" : typeof render
        ) : 0 !== render.length && 2 !== render.length && console.error(
          "forwardRef render functions accept exactly two parameters: props and ref. %s",
          1 === render.length ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined."
        );
        null != render && null != render.defaultProps && console.error(
          "forwardRef render functions do not support defaultProps. Did you accidentally pass a React component?"
        );
        var elementType = { $$typeof: REACT_FORWARD_REF_TYPE, render }, ownName;
        Object.defineProperty(elementType, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            render.name || render.displayName || (Object.defineProperty(render, "name", { value: name }), render.displayName = name);
          }
        });
        return elementType;
      };
      exports2.isValidElement = isValidElement;
      exports2.lazy = function(ctor) {
        ctor = { _status: -1, _result: ctor };
        var lazyType = {
          $$typeof: REACT_LAZY_TYPE,
          _payload: ctor,
          _init: lazyInitializer
        }, ioInfo = {
          name: "lazy",
          start: -1,
          end: -1,
          value: null,
          owner: null,
          debugStack: Error("react-stack-top-frame"),
          debugTask: console.createTask ? console.createTask("lazy()") : null
        };
        ctor._ioInfo = ioInfo;
        lazyType._debugInfo = [{ awaited: ioInfo }];
        return lazyType;
      };
      exports2.memo = function(type, compare) {
        null == type && console.error(
          "memo: The first argument must be a component. Instead received: %s",
          null === type ? "null" : typeof type
        );
        compare = {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
        var ownName;
        Object.defineProperty(compare, "displayName", {
          enumerable: false,
          configurable: true,
          get: function() {
            return ownName;
          },
          set: function(name) {
            ownName = name;
            type.name || type.displayName || (Object.defineProperty(type, "name", { value: name }), type.displayName = name);
          }
        });
        return compare;
      };
      exports2.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        currentTransition._updatedFibers = /* @__PURE__ */ new Set();
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(noop, reportGlobalError));
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null === prevTransition && currentTransition._updatedFibers && (scope = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < scope && console.warn(
            "Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."
          )), null !== prevTransition && null !== currentTransition.types && (null !== prevTransition.types && prevTransition.types !== currentTransition.types && console.error(
            "We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."
          ), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports2.unstable_useCacheRefresh = function() {
        return resolveDispatcher().useCacheRefresh();
      };
      exports2.use = function(usable) {
        return resolveDispatcher().use(usable);
      };
      exports2.useActionState = function(action, initialState, permalink) {
        return resolveDispatcher().useActionState(
          action,
          initialState,
          permalink
        );
      };
      exports2.useCallback = function(callback, deps) {
        return resolveDispatcher().useCallback(callback, deps);
      };
      exports2.useContext = function(Context) {
        var dispatcher = resolveDispatcher();
        Context.$$typeof === REACT_CONSUMER_TYPE && console.error(
          "Calling useContext(Context.Consumer) is not supported and will cause bugs. Did you mean to call useContext(Context) instead?"
        );
        return dispatcher.useContext(Context);
      };
      exports2.useDebugValue = function(value, formatterFn) {
        return resolveDispatcher().useDebugValue(value, formatterFn);
      };
      exports2.useDeferredValue = function(value, initialValue) {
        return resolveDispatcher().useDeferredValue(value, initialValue);
      };
      exports2.useEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useEffect(create, deps);
      };
      exports2.useEffectEvent = function(callback) {
        return resolveDispatcher().useEffectEvent(callback);
      };
      exports2.useId = function() {
        return resolveDispatcher().useId();
      };
      exports2.useImperativeHandle = function(ref, create, deps) {
        return resolveDispatcher().useImperativeHandle(ref, create, deps);
      };
      exports2.useInsertionEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useInsertionEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useInsertionEffect(create, deps);
      };
      exports2.useLayoutEffect = function(create, deps) {
        null == create && console.warn(
          "React Hook useLayoutEffect requires an effect callback. Did you forget to pass a callback to the hook?"
        );
        return resolveDispatcher().useLayoutEffect(create, deps);
      };
      exports2.useMemo = function(create, deps) {
        return resolveDispatcher().useMemo(create, deps);
      };
      exports2.useOptimistic = function(passthrough, reducer) {
        return resolveDispatcher().useOptimistic(passthrough, reducer);
      };
      exports2.useReducer = function(reducer, initialArg, init) {
        return resolveDispatcher().useReducer(reducer, initialArg, init);
      };
      exports2.useRef = function(initialValue) {
        return resolveDispatcher().useRef(initialValue);
      };
      exports2.useState = function(initialState) {
        return resolveDispatcher().useState(initialState);
      };
      exports2.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return resolveDispatcher().useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports2.useTransition = function() {
        return resolveDispatcher().useTransition();
      };
      exports2.version = "19.2.1";
      "undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ && "function" === typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
    })();
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/next/dist/client/components/hooks-server-context.js
var require_hooks_server_context = __commonJS({
  "node_modules/next/dist/client/components/hooks-server-context.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      DynamicServerError: function() {
        return DynamicServerError;
      },
      isDynamicServerError: function() {
        return isDynamicServerError;
      }
    });
    var DYNAMIC_ERROR_CODE = "DYNAMIC_SERVER_USAGE";
    var DynamicServerError = class extends Error {
      constructor(description) {
        super(`Dynamic server usage: ${description}`), this.description = description, this.digest = DYNAMIC_ERROR_CODE;
      }
    };
    function isDynamicServerError(err) {
      if (typeof err !== "object" || err === null || !("digest" in err) || typeof err.digest !== "string") {
        return false;
      }
      return err.digest === DYNAMIC_ERROR_CODE;
    }
    if ((typeof exports2.default === "function" || typeof exports2.default === "object" && exports2.default !== null) && typeof exports2.default.__esModule === "undefined") {
      Object.defineProperty(exports2.default, "__esModule", { value: true });
      Object.assign(exports2.default, exports2);
      module2.exports = exports2.default;
    }
  }
});

// node_modules/next/dist/client/components/static-generation-bailout.js
var require_static_generation_bailout = __commonJS({
  "node_modules/next/dist/client/components/static-generation-bailout.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      StaticGenBailoutError: function() {
        return StaticGenBailoutError;
      },
      isStaticGenBailoutError: function() {
        return isStaticGenBailoutError;
      }
    });
    var NEXT_STATIC_GEN_BAILOUT = "NEXT_STATIC_GEN_BAILOUT";
    var StaticGenBailoutError = class extends Error {
      constructor(...args) {
        super(...args), this.code = NEXT_STATIC_GEN_BAILOUT;
      }
    };
    function isStaticGenBailoutError(error) {
      if (typeof error !== "object" || error === null || !("code" in error)) {
        return false;
      }
      return error.code === NEXT_STATIC_GEN_BAILOUT;
    }
    if ((typeof exports2.default === "function" || typeof exports2.default === "object" && exports2.default !== null) && typeof exports2.default.__esModule === "undefined") {
      Object.defineProperty(exports2.default, "__esModule", { value: true });
      Object.assign(exports2.default, exports2);
      module2.exports = exports2.default;
    }
  }
});

// node_modules/next/dist/server/dynamic-rendering-utils.js
var require_dynamic_rendering_utils = __commonJS({
  "node_modules/next/dist/server/dynamic-rendering-utils.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      delayUntilRuntimeStage: function() {
        return delayUntilRuntimeStage;
      },
      getRuntimeStage: function() {
        return getRuntimeStage;
      },
      isHangingPromiseRejectionError: function() {
        return isHangingPromiseRejectionError;
      },
      makeDevtoolsIOAwarePromise: function() {
        return makeDevtoolsIOAwarePromise;
      },
      makeHangingPromise: function() {
        return makeHangingPromise;
      }
    });
    var _stagedrendering = require_staged_rendering();
    function isHangingPromiseRejectionError(err) {
      if (typeof err !== "object" || err === null || !("digest" in err)) {
        return false;
      }
      return err.digest === HANGING_PROMISE_REJECTION;
    }
    var HANGING_PROMISE_REJECTION = "HANGING_PROMISE_REJECTION";
    var HangingPromiseRejectionError = class extends Error {
      constructor(route, expression) {
        super(`During prerendering, ${expression} rejects when the prerender is complete. Typically these errors are handled by React but if you move ${expression} to a different context by using \`setTimeout\`, \`after\`, or similar functions you may observe this error and you should handle it in that context. This occurred at route "${route}".`), this.route = route, this.expression = expression, this.digest = HANGING_PROMISE_REJECTION;
      }
    };
    var abortListenersBySignal = /* @__PURE__ */ new WeakMap();
    function makeHangingPromise(signal, route, expression) {
      if (signal.aborted) {
        return Promise.reject(new HangingPromiseRejectionError(route, expression));
      } else {
        const hangingPromise = new Promise((_, reject) => {
          const boundRejection = reject.bind(null, new HangingPromiseRejectionError(route, expression));
          let currentListeners = abortListenersBySignal.get(signal);
          if (currentListeners) {
            currentListeners.push(boundRejection);
          } else {
            const listeners = [
              boundRejection
            ];
            abortListenersBySignal.set(signal, listeners);
            signal.addEventListener("abort", () => {
              for (let i = 0; i < listeners.length; i++) {
                listeners[i]();
              }
            }, {
              once: true
            });
          }
        });
        hangingPromise.catch(ignoreReject);
        return hangingPromise;
      }
    }
    function ignoreReject() {
    }
    function makeDevtoolsIOAwarePromise(underlying, requestStore, stage) {
      if (requestStore.stagedRendering) {
        return requestStore.stagedRendering.delayUntilStage(stage, void 0, underlying);
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(underlying);
        }, 0);
      });
    }
    function getRuntimeStage(stagedRendering) {
      if (stagedRendering.currentStage === _stagedrendering.RenderStage.EarlyStatic || stagedRendering.currentStage === _stagedrendering.RenderStage.EarlyRuntime) {
        return _stagedrendering.RenderStage.EarlyRuntime;
      }
      return _stagedrendering.RenderStage.Runtime;
    }
    function delayUntilRuntimeStage(prerenderStore, result) {
      const { stagedRendering } = prerenderStore;
      if (!stagedRendering) {
        return result;
      }
      return stagedRendering.waitForStage(getRuntimeStage(stagedRendering)).then(() => result);
    }
  }
});

// node_modules/next/dist/lib/framework/boundary-constants.js
var require_boundary_constants = __commonJS({
  "node_modules/next/dist/lib/framework/boundary-constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      METADATA_BOUNDARY_NAME: function() {
        return METADATA_BOUNDARY_NAME;
      },
      OUTLET_BOUNDARY_NAME: function() {
        return OUTLET_BOUNDARY_NAME;
      },
      ROOT_LAYOUT_BOUNDARY_NAME: function() {
        return ROOT_LAYOUT_BOUNDARY_NAME;
      },
      VIEWPORT_BOUNDARY_NAME: function() {
        return VIEWPORT_BOUNDARY_NAME;
      }
    });
    var METADATA_BOUNDARY_NAME = "__next_metadata_boundary__";
    var VIEWPORT_BOUNDARY_NAME = "__next_viewport_boundary__";
    var OUTLET_BOUNDARY_NAME = "__next_outlet_boundary__";
    var ROOT_LAYOUT_BOUNDARY_NAME = "__next_root_layout_boundary__";
  }
});

// node_modules/next/dist/lib/scheduler.js
var require_scheduler = __commonJS({
  "node_modules/next/dist/lib/scheduler.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      atLeastOneTask: function() {
        return atLeastOneTask;
      },
      scheduleImmediate: function() {
        return scheduleImmediate;
      },
      scheduleOnNextTick: function() {
        return scheduleOnNextTick;
      },
      waitAtLeastOneReactRenderTask: function() {
        return waitAtLeastOneReactRenderTask;
      }
    });
    var scheduleOnNextTick = (cb) => {
      Promise.resolve().then(() => {
        if (process.env.NEXT_RUNTIME === "edge") {
          setTimeout(cb, 0);
        } else {
          process.nextTick(cb);
        }
      });
    };
    var scheduleImmediate = (cb) => {
      if (process.env.NEXT_RUNTIME === "edge") {
        setTimeout(cb, 0);
      } else {
        setImmediate(cb);
      }
    };
    function atLeastOneTask() {
      return new Promise((resolve) => scheduleImmediate(resolve));
    }
    function waitAtLeastOneReactRenderTask() {
      if (process.env.NEXT_RUNTIME === "edge") {
        return new Promise((r) => setTimeout(r, 0));
      } else {
        return new Promise((r) => setImmediate(r));
      }
    }
  }
});

// node_modules/next/dist/shared/lib/lazy-dynamic/bailout-to-csr.js
var require_bailout_to_csr = __commonJS({
  "node_modules/next/dist/shared/lib/lazy-dynamic/bailout-to-csr.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      BailoutToCSRError: function() {
        return BailoutToCSRError;
      },
      isBailoutToCSRError: function() {
        return isBailoutToCSRError;
      }
    });
    var BAILOUT_TO_CSR = "BAILOUT_TO_CLIENT_SIDE_RENDERING";
    var BailoutToCSRError = class extends Error {
      constructor(reason) {
        super(`Bail out to client-side rendering: ${reason}`), this.reason = reason, this.digest = BAILOUT_TO_CSR;
      }
    };
    function isBailoutToCSRError(err) {
      if (typeof err !== "object" || err === null || !("digest" in err)) {
        return false;
      }
      return err.digest === BAILOUT_TO_CSR;
    }
  }
});

// node_modules/next/dist/server/app-render/instant-validation/boundary-constants.js
var require_boundary_constants2 = __commonJS({
  "node_modules/next/dist/server/app-render/instant-validation/boundary-constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "INSTANT_VALIDATION_BOUNDARY_NAME", {
      enumerable: true,
      get: function() {
        return INSTANT_VALIDATION_BOUNDARY_NAME;
      }
    });
    var INSTANT_VALIDATION_BOUNDARY_NAME = "__next_instant_validation_boundary__";
  }
});

// node_modules/next/dist/server/app-render/dynamic-rendering.js
var require_dynamic_rendering = __commonJS({
  "node_modules/next/dist/server/app-render/dynamic-rendering.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      DynamicHoleKind: function() {
        return DynamicHoleKind;
      },
      Postpone: function() {
        return Postpone;
      },
      PreludeState: function() {
        return PreludeState;
      },
      abortAndThrowOnSynchronousRequestDataAccess: function() {
        return abortAndThrowOnSynchronousRequestDataAccess;
      },
      abortOnSynchronousPlatformIOAccess: function() {
        return abortOnSynchronousPlatformIOAccess;
      },
      accessedDynamicData: function() {
        return accessedDynamicData;
      },
      annotateDynamicAccess: function() {
        return annotateDynamicAccess;
      },
      consumeDynamicAccess: function() {
        return consumeDynamicAccess;
      },
      createDynamicTrackingState: function() {
        return createDynamicTrackingState;
      },
      createDynamicValidationState: function() {
        return createDynamicValidationState;
      },
      createHangingInputAbortSignal: function() {
        return createHangingInputAbortSignal;
      },
      createInstantValidationState: function() {
        return createInstantValidationState;
      },
      createRenderInBrowserAbortSignal: function() {
        return createRenderInBrowserAbortSignal;
      },
      formatDynamicAPIAccesses: function() {
        return formatDynamicAPIAccesses;
      },
      getFirstDynamicReason: function() {
        return getFirstDynamicReason;
      },
      getNavigationDisallowedDynamicReasons: function() {
        return getNavigationDisallowedDynamicReasons;
      },
      getStaticShellDisallowedDynamicReasons: function() {
        return getStaticShellDisallowedDynamicReasons;
      },
      isDynamicPostpone: function() {
        return isDynamicPostpone;
      },
      isPrerenderInterruptedError: function() {
        return isPrerenderInterruptedError;
      },
      logDisallowedDynamicError: function() {
        return logDisallowedDynamicError;
      },
      markCurrentScopeAsDynamic: function() {
        return markCurrentScopeAsDynamic;
      },
      postponeWithTracking: function() {
        return postponeWithTracking;
      },
      throwIfDisallowedDynamic: function() {
        return throwIfDisallowedDynamic;
      },
      throwToInterruptStaticGeneration: function() {
        return throwToInterruptStaticGeneration;
      },
      trackAllowedDynamicAccess: function() {
        return trackAllowedDynamicAccess;
      },
      trackDynamicDataInDynamicRender: function() {
        return trackDynamicDataInDynamicRender;
      },
      trackDynamicHoleInNavigation: function() {
        return trackDynamicHoleInNavigation;
      },
      trackDynamicHoleInRuntimeShell: function() {
        return trackDynamicHoleInRuntimeShell;
      },
      trackDynamicHoleInStaticShell: function() {
        return trackDynamicHoleInStaticShell;
      },
      trackThrownErrorInNavigation: function() {
        return trackThrownErrorInNavigation;
      },
      useDynamicRouteParams: function() {
        return useDynamicRouteParams;
      },
      useDynamicSearchParams: function() {
        return useDynamicSearchParams;
      }
    });
    var _react = /* @__PURE__ */ _interop_require_default(require_react());
    var _hooksservercontext = require_hooks_server_context();
    var _staticgenerationbailout = require_static_generation_bailout();
    var _workunitasyncstorageexternal = require_work_unit_async_storage_external();
    var _workasyncstorageexternal = require_work_async_storage_external();
    var _dynamicrenderingutils = require_dynamic_rendering_utils();
    var _boundaryconstants = require_boundary_constants();
    var _scheduler = require_scheduler();
    var _bailouttocsr = require_bailout_to_csr();
    var _invarianterror = require_invariant_error();
    var _boundaryconstants1 = require_boundary_constants2();
    function _interop_require_default(obj) {
      return obj && obj.__esModule ? obj : {
        default: obj
      };
    }
    var hasPostpone = typeof _react.default.unstable_postpone === "function";
    function createDynamicTrackingState(isDebugDynamicAccesses) {
      return {
        isDebugDynamicAccesses,
        dynamicAccesses: [],
        syncDynamicErrorWithStack: null
      };
    }
    function createDynamicValidationState() {
      return {
        hasSuspenseAboveBody: false,
        hasDynamicMetadata: false,
        dynamicMetadata: null,
        hasDynamicViewport: false,
        hasAllowedDynamic: false,
        dynamicErrors: []
      };
    }
    function getFirstDynamicReason(trackingState) {
      var _trackingState_dynamicAccesses_;
      return (_trackingState_dynamicAccesses_ = trackingState.dynamicAccesses[0]) == null ? void 0 : _trackingState_dynamicAccesses_.expression;
    }
    function markCurrentScopeAsDynamic(store, workUnitStore, expression) {
      if (workUnitStore) {
        switch (workUnitStore.type) {
          case "cache":
          case "unstable-cache":
            return;
          case "private-cache":
            return;
          case "prerender-legacy":
          case "prerender-ppr":
          case "request":
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
      if (store.forceDynamic || store.forceStatic) return;
      if (store.dynamicShouldError) {
        throw Object.defineProperty(new _staticgenerationbailout.StaticGenBailoutError(`Route ${store.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`), "__NEXT_ERROR_CODE", {
          value: "E553",
          enumerable: false,
          configurable: true
        });
      }
      if (workUnitStore) {
        switch (workUnitStore.type) {
          case "prerender-ppr":
            return postponeWithTracking(store.route, expression, workUnitStore.dynamicTracking);
          case "prerender-legacy":
            workUnitStore.revalidate = 0;
            const err = Object.defineProperty(new _hooksservercontext.DynamicServerError(`Route ${store.route} couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`), "__NEXT_ERROR_CODE", {
              value: "E550",
              enumerable: false,
              configurable: true
            });
            store.dynamicUsageDescription = expression;
            store.dynamicUsageStack = err.stack;
            throw err;
          case "request":
            if (process.env.NODE_ENV !== "production") {
              workUnitStore.usedDynamic = true;
            }
            break;
          case "generate-static-params":
            break;
          default:
            workUnitStore;
        }
      }
    }
    function throwToInterruptStaticGeneration(expression, store, prerenderStore) {
      const err = Object.defineProperty(new _hooksservercontext.DynamicServerError(`Route ${store.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`), "__NEXT_ERROR_CODE", {
        value: "E558",
        enumerable: false,
        configurable: true
      });
      prerenderStore.revalidate = 0;
      store.dynamicUsageDescription = expression;
      store.dynamicUsageStack = err.stack;
      throw err;
    }
    function trackDynamicDataInDynamicRender(workUnitStore) {
      switch (workUnitStore.type) {
        case "cache":
        case "unstable-cache":
          return;
        case "private-cache":
          return;
        case "prerender":
        case "prerender-runtime":
        case "prerender-legacy":
        case "prerender-ppr":
        case "prerender-client":
        case "validation-client":
        case "generate-static-params":
          break;
        case "request":
          if (process.env.NODE_ENV !== "production") {
            workUnitStore.usedDynamic = true;
          }
          break;
        default:
          workUnitStore;
      }
    }
    function abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore) {
      const reason = `Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`;
      const error = createPrerenderInterruptedError(reason);
      prerenderStore.controller.abort(error);
      const dynamicTracking = prerenderStore.dynamicTracking;
      if (dynamicTracking) {
        dynamicTracking.dynamicAccesses.push({
          // When we aren't debugging, we don't need to create another error for the
          // stack trace.
          stack: dynamicTracking.isDebugDynamicAccesses ? new Error().stack : void 0,
          expression
        });
      }
    }
    function abortOnSynchronousPlatformIOAccess(route, expression, errorWithStack, prerenderStore) {
      const dynamicTracking = prerenderStore.dynamicTracking;
      abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore);
      if (dynamicTracking) {
        if (dynamicTracking.syncDynamicErrorWithStack === null) {
          dynamicTracking.syncDynamicErrorWithStack = errorWithStack;
        }
      }
    }
    function abortAndThrowOnSynchronousRequestDataAccess(route, expression, errorWithStack, prerenderStore) {
      const prerenderSignal = prerenderStore.controller.signal;
      if (prerenderSignal.aborted === false) {
        abortOnSynchronousDynamicDataAccess(route, expression, prerenderStore);
        const dynamicTracking = prerenderStore.dynamicTracking;
        if (dynamicTracking) {
          if (dynamicTracking.syncDynamicErrorWithStack === null) {
            dynamicTracking.syncDynamicErrorWithStack = errorWithStack;
          }
        }
      }
      throw createPrerenderInterruptedError(`Route ${route} needs to bail out of prerendering at this point because it used ${expression}.`);
    }
    function Postpone({ reason, route }) {
      const prerenderStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      const dynamicTracking = prerenderStore && prerenderStore.type === "prerender-ppr" ? prerenderStore.dynamicTracking : null;
      postponeWithTracking(route, reason, dynamicTracking);
    }
    function postponeWithTracking(route, expression, dynamicTracking) {
      assertPostpone();
      if (dynamicTracking) {
        dynamicTracking.dynamicAccesses.push({
          // When we aren't debugging, we don't need to create another error for the
          // stack trace.
          stack: dynamicTracking.isDebugDynamicAccesses ? new Error().stack : void 0,
          expression
        });
      }
      _react.default.unstable_postpone(createPostponeReason(route, expression));
    }
    function createPostponeReason(route, expression) {
      return `Route ${route} needs to bail out of prerendering at this point because it used ${expression}. React throws this special object to indicate where. It should not be caught by your own try/catch. Learn more: https://nextjs.org/docs/messages/ppr-caught-error`;
    }
    function isDynamicPostpone(err) {
      if (typeof err === "object" && err !== null && typeof err.message === "string") {
        return isDynamicPostponeReason(err.message);
      }
      return false;
    }
    function isDynamicPostponeReason(reason) {
      return reason.includes("needs to bail out of prerendering at this point because it used") && reason.includes("Learn more: https://nextjs.org/docs/messages/ppr-caught-error");
    }
    if (isDynamicPostponeReason(createPostponeReason("%%%", "^^^")) === false) {
      throw Object.defineProperty(new Error("Invariant: isDynamicPostpone misidentified a postpone reason. This is a bug in Next.js"), "__NEXT_ERROR_CODE", {
        value: "E296",
        enumerable: false,
        configurable: true
      });
    }
    var NEXT_PRERENDER_INTERRUPTED = "NEXT_PRERENDER_INTERRUPTED";
    function createPrerenderInterruptedError(message3) {
      const error = Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
        value: "E394",
        enumerable: false,
        configurable: true
      });
      error.digest = NEXT_PRERENDER_INTERRUPTED;
      return error;
    }
    function isPrerenderInterruptedError(error) {
      return typeof error === "object" && error !== null && error.digest === NEXT_PRERENDER_INTERRUPTED && "name" in error && "message" in error && error instanceof Error;
    }
    function accessedDynamicData(dynamicAccesses) {
      return dynamicAccesses.length > 0;
    }
    function consumeDynamicAccess(serverDynamic, clientDynamic) {
      serverDynamic.dynamicAccesses.push(...clientDynamic.dynamicAccesses);
      return serverDynamic.dynamicAccesses;
    }
    function formatDynamicAPIAccesses(dynamicAccesses) {
      return dynamicAccesses.filter((access) => typeof access.stack === "string" && access.stack.length > 0).map(({ expression, stack }) => {
        stack = stack.split("\n").slice(4).filter((line) => {
          if (line.includes("node_modules/next/")) {
            return false;
          }
          if (line.includes(" (<anonymous>)")) {
            return false;
          }
          if (line.includes(" (node:")) {
            return false;
          }
          return true;
        }).join("\n");
        return `Dynamic API Usage Debug - ${expression}:
${stack}`;
      });
    }
    function assertPostpone() {
      if (!hasPostpone) {
        throw Object.defineProperty(new Error(`Invariant: React.unstable_postpone is not defined. This suggests the wrong version of React was loaded. This is a bug in Next.js`), "__NEXT_ERROR_CODE", {
          value: "E224",
          enumerable: false,
          configurable: true
        });
      }
    }
    function createRenderInBrowserAbortSignal() {
      const controller = new AbortController();
      controller.abort(Object.defineProperty(new _bailouttocsr.BailoutToCSRError("Render in Browser"), "__NEXT_ERROR_CODE", {
        value: "E721",
        enumerable: false,
        configurable: true
      }));
      return controller.signal;
    }
    function createHangingInputAbortSignal(workUnitStore) {
      switch (workUnitStore.type) {
        case "prerender":
        case "prerender-runtime":
          const controller = new AbortController();
          if (workUnitStore.cacheSignal) {
            workUnitStore.cacheSignal.inputReady().then(() => {
              controller.abort();
            });
          } else {
            if (
              // eslint-disable-next-line no-restricted-syntax -- We are discriminating between two different refined types and don't need an addition exhaustive switch here
              workUnitStore.type === "prerender-runtime" && workUnitStore.stagedRendering
            ) {
              const { stagedRendering } = workUnitStore;
              stagedRendering.waitForStage((0, _dynamicrenderingutils.getRuntimeStage)(stagedRendering)).then(() => (0, _scheduler.scheduleOnNextTick)(() => controller.abort()));
            } else {
              (0, _scheduler.scheduleOnNextTick)(() => controller.abort());
            }
          }
          return controller.signal;
        case "prerender-client":
        case "validation-client":
        case "prerender-ppr":
        case "prerender-legacy":
        case "request":
        case "cache":
        case "private-cache":
        case "unstable-cache":
        case "generate-static-params":
          return void 0;
        default:
          workUnitStore;
      }
    }
    function annotateDynamicAccess(expression, prerenderStore) {
      const dynamicTracking = prerenderStore.dynamicTracking;
      if (dynamicTracking) {
        dynamicTracking.dynamicAccesses.push({
          stack: dynamicTracking.isDebugDynamicAccesses ? new Error().stack : void 0,
          expression
        });
      }
    }
    function useDynamicRouteParams(expression) {
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (workStore && workUnitStore) {
        switch (workUnitStore.type) {
          case "prerender-client":
          case "prerender": {
            const fallbackParams = workUnitStore.fallbackRouteParams;
            if (fallbackParams && fallbackParams.size > 0) {
              _react.default.use((0, _dynamicrenderingutils.makeHangingPromise)(workUnitStore.renderSignal, workStore.route, expression));
            }
            break;
          }
          case "prerender-ppr": {
            const fallbackParams = workUnitStore.fallbackRouteParams;
            if (fallbackParams && fallbackParams.size > 0) {
              return postponeWithTracking(workStore.route, expression, workUnitStore.dynamicTracking);
            }
            break;
          }
          case "validation-client": {
            break;
          }
          case "prerender-runtime":
            throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called during a runtime prerender. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
              value: "E771",
              enumerable: false,
              configurable: true
            });
          case "cache":
          case "private-cache":
            throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called inside a cache scope. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
              value: "E745",
              enumerable: false,
              configurable: true
            });
          case "generate-static-params":
            throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called in \`generateStaticParams\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
              value: "E1130",
              enumerable: false,
              configurable: true
            });
          case "prerender-legacy":
          case "request":
          case "unstable-cache":
            break;
          default:
            workUnitStore;
        }
      }
    }
    function useDynamicSearchParams(expression) {
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (!workStore) {
        return;
      }
      if (!workUnitStore) {
        (0, _workunitasyncstorageexternal.throwForMissingRequestStore)(expression);
      }
      switch (workUnitStore.type) {
        case "validation-client":
          return;
        case "prerender-client": {
          _react.default.use((0, _dynamicrenderingutils.makeHangingPromise)(workUnitStore.renderSignal, workStore.route, expression));
          break;
        }
        case "prerender-legacy":
        case "prerender-ppr": {
          if (workStore.forceStatic) {
            return;
          }
          throw Object.defineProperty(new _bailouttocsr.BailoutToCSRError(expression), "__NEXT_ERROR_CODE", {
            value: "E394",
            enumerable: false,
            configurable: true
          });
        }
        case "prerender":
        case "prerender-runtime":
          throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called from a Server Component. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
            value: "E795",
            enumerable: false,
            configurable: true
          });
        case "cache":
        case "unstable-cache":
        case "private-cache":
          throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called inside a cache scope. Next.js should be preventing ${expression} from being included in server components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
            value: "E745",
            enumerable: false,
            configurable: true
          });
        case "generate-static-params":
          throw Object.defineProperty(new _invarianterror.InvariantError(`\`${expression}\` was called in \`generateStaticParams\`. Next.js should be preventing ${expression} from being included in server component files statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
            value: "E1130",
            enumerable: false,
            configurable: true
          });
        case "request":
          return;
        default:
          workUnitStore;
      }
    }
    var hasSuspenseRegex = /\n\s+at Suspense \(<anonymous>\)/;
    var bodyAndImplicitTags = "body|div|main|section|article|aside|header|footer|nav|form|p|span|h1|h2|h3|h4|h5|h6";
    var hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex = new RegExp(`\\n\\s+at Suspense \\(<anonymous>\\)(?:(?!\\n\\s+at (?:${bodyAndImplicitTags}) \\(<anonymous>\\))[\\s\\S])*?\\n\\s+at ${_boundaryconstants.ROOT_LAYOUT_BOUNDARY_NAME} \\([^\\n]*\\)`);
    var hasMetadataRegex = new RegExp(`\\n\\s+at ${_boundaryconstants.METADATA_BOUNDARY_NAME}[\\n\\s]`);
    var hasViewportRegex = new RegExp(`\\n\\s+at ${_boundaryconstants.VIEWPORT_BOUNDARY_NAME}[\\n\\s]`);
    var hasOutletRegex = new RegExp(`\\n\\s+at ${_boundaryconstants.OUTLET_BOUNDARY_NAME}[\\n\\s]`);
    var hasInstantValidationBoundaryRegex = new RegExp(`\\n\\s+at ${_boundaryconstants1.INSTANT_VALIDATION_BOUNDARY_NAME}[\\n\\s]`);
    function trackAllowedDynamicAccess(workStore, componentStack, dynamicValidation, clientDynamic) {
      if (hasOutletRegex.test(componentStack)) {
        return;
      } else if (hasMetadataRegex.test(componentStack)) {
        dynamicValidation.hasDynamicMetadata = true;
        return;
      } else if (hasViewportRegex.test(componentStack)) {
        dynamicValidation.hasDynamicViewport = true;
        return;
      } else if (hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        dynamicValidation.hasSuspenseAboveBody = true;
        return;
      } else if (hasSuspenseRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        return;
      } else if (clientDynamic.syncDynamicErrorWithStack) {
        dynamicValidation.dynamicErrors.push(clientDynamic.syncDynamicErrorWithStack);
        return;
      } else {
        const message3 = `Route "${workStore.route}": Uncached data was accessed outside of <Suspense>. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route`;
        const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
          value: "E1079",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicErrors.push(error);
        return;
      }
    }
    var DynamicHoleKind = /* @__PURE__ */ (function(DynamicHoleKind2) {
      DynamicHoleKind2[DynamicHoleKind2["Runtime"] = 1] = "Runtime";
      DynamicHoleKind2[DynamicHoleKind2["Dynamic"] = 2] = "Dynamic";
      return DynamicHoleKind2;
    })({});
    function createInstantValidationState(createInstantStack) {
      return {
        hasDynamicMetadata: false,
        hasAllowedClientDynamicAboveBoundary: false,
        dynamicMetadata: null,
        hasDynamicViewport: false,
        hasAllowedDynamic: false,
        dynamicErrors: [],
        validationPreventingErrors: [],
        thrownErrorsOutsideBoundary: [],
        createInstantStack
      };
    }
    function trackDynamicHoleInNavigation(workStore, componentStack, dynamicValidation, clientDynamic, kind, boundaryState) {
      if (hasOutletRegex.test(componentStack)) {
        return;
      }
      if (hasMetadataRegex.test(componentStack)) {
        const usageDescription2 = kind === 1 ? `Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateMetadata\` or you have file-based metadata such as icons that depend on dynamic params segments.` : `Uncached data or \`connection()\` was accessed inside \`generateMetadata\`.`;
        const message4 = `Route "${workStore.route}": ${usageDescription2} Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`;
        const error2 = addErrorContext(Object.defineProperty(new Error(message4), "__NEXT_ERROR_CODE", {
          value: "E1076",
          enumerable: false,
          configurable: true
        }), componentStack, dynamicValidation.createInstantStack);
        dynamicValidation.dynamicMetadata = error2;
        return;
      }
      if (hasViewportRegex.test(componentStack)) {
        const usageDescription2 = kind === 1 ? `Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateViewport\`.` : `Uncached data or \`connection()\` was accessed inside \`generateViewport\`.`;
        const message4 = `Route "${workStore.route}": ${usageDescription2} This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`;
        const error2 = addErrorContext(Object.defineProperty(new Error(message4), "__NEXT_ERROR_CODE", {
          value: "E1086",
          enumerable: false,
          configurable: true
        }), componentStack, dynamicValidation.createInstantStack);
        dynamicValidation.dynamicErrors.push(error2);
        return;
      }
      const boundaryLocation = hasInstantValidationBoundaryRegex.exec(componentStack);
      if (!boundaryLocation) {
        if (boundaryState.expectedIds.size === boundaryState.renderedIds.size) {
          dynamicValidation.hasAllowedClientDynamicAboveBoundary = true;
          dynamicValidation.hasAllowedDynamic = true;
          return;
        } else {
          const message4 = `Route "${workStore.route}": Could not validate \`unstable_instant\` because a Client Component in a parent segment prevented the page from rendering.`;
          const error2 = addErrorContext(Object.defineProperty(new Error(message4), "__NEXT_ERROR_CODE", {
            value: "E1082",
            enumerable: false,
            configurable: true
          }), componentStack, dynamicValidation.createInstantStack);
          dynamicValidation.validationPreventingErrors.push(error2);
          return;
        }
      } else {
        const suspenseLocation = hasSuspenseRegex.exec(componentStack);
        if (suspenseLocation) {
          if (suspenseLocation.index < boundaryLocation.index) {
            dynamicValidation.hasAllowedDynamic = true;
            return;
          } else {
          }
        }
      }
      if (clientDynamic.syncDynamicErrorWithStack) {
        const syncError = clientDynamic.syncDynamicErrorWithStack;
        if (dynamicValidation.createInstantStack !== null && syncError.cause === void 0) {
          syncError.cause = dynamicValidation.createInstantStack();
        }
        dynamicValidation.dynamicErrors.push(syncError);
        return;
      }
      const usageDescription = kind === 1 ? `Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`.` : `Uncached data or \`connection()\` was accessed outside of \`<Suspense>\`.`;
      const message3 = `Route "${workStore.route}": ${usageDescription} This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route`;
      const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
        value: "E1078",
        enumerable: false,
        configurable: true
      }), componentStack, dynamicValidation.createInstantStack);
      dynamicValidation.dynamicErrors.push(error);
      return;
    }
    function trackThrownErrorInNavigation(workStore, dynamicValidation, thrownValue, componentStack) {
      const boundaryLocation = hasInstantValidationBoundaryRegex.exec(componentStack);
      if (!boundaryLocation) {
        const error = addErrorContext(Object.defineProperty(new Error("An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.", {
          cause: thrownValue
        }), "__NEXT_ERROR_CODE", {
          value: "E1118",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.thrownErrorsOutsideBoundary.push(error);
      } else {
        const suspenseLocation = hasSuspenseRegex.exec(componentStack);
        if (suspenseLocation) {
          if (suspenseLocation.index < boundaryLocation.index) {
            return;
          } else {
          }
        }
        const message3 = `Route "${workStore.route}": Could not validate \`unstable_instant\` because an error prevented the target segment from rendering.`;
        const error = addErrorContext(
          Object.defineProperty(new Error(message3, {
            cause: thrownValue
          }), "__NEXT_ERROR_CODE", {
            value: "E1112",
            enumerable: false,
            configurable: true
          }),
          componentStack,
          null
          // TODO(instant-validation-build): conflicting use of cause
        );
        dynamicValidation.validationPreventingErrors.push(error);
      }
    }
    function trackDynamicHoleInRuntimeShell(workStore, componentStack, dynamicValidation, clientDynamic) {
      if (hasOutletRegex.test(componentStack)) {
        return;
      } else if (hasMetadataRegex.test(componentStack)) {
        const message4 = `Route "${workStore.route}": Uncached data or \`connection()\` was accessed inside \`generateMetadata\`. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`;
        const error2 = addErrorContext(Object.defineProperty(new Error(message4), "__NEXT_ERROR_CODE", {
          value: "E1080",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicMetadata = error2;
        return;
      } else if (hasViewportRegex.test(componentStack)) {
        const message4 = `Route "${workStore.route}": Uncached data or \`connection()\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`;
        const error2 = addErrorContext(Object.defineProperty(new Error(message4), "__NEXT_ERROR_CODE", {
          value: "E1077",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicErrors.push(error2);
        return;
      } else if (hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        dynamicValidation.hasSuspenseAboveBody = true;
        return;
      } else if (hasSuspenseRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        return;
      } else if (clientDynamic.syncDynamicErrorWithStack) {
        dynamicValidation.dynamicErrors.push(clientDynamic.syncDynamicErrorWithStack);
        return;
      }
      const message3 = `Route "${workStore.route}": Uncached data or \`connection()\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route`;
      const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
        value: "E1084",
        enumerable: false,
        configurable: true
      }), componentStack, null);
      dynamicValidation.dynamicErrors.push(error);
      return;
    }
    function trackDynamicHoleInStaticShell(workStore, componentStack, dynamicValidation, clientDynamic) {
      if (hasOutletRegex.test(componentStack)) {
        return;
      } else if (hasMetadataRegex.test(componentStack)) {
        const message3 = `Route "${workStore.route}": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateMetadata\` or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`;
        const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
          value: "E1085",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicMetadata = error;
        return;
      } else if (hasViewportRegex.test(componentStack)) {
        const message3 = `Route "${workStore.route}": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateViewport\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`;
        const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
          value: "E1081",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicErrors.push(error);
        return;
      } else if (hasSuspenseBeforeRootLayoutWithoutBodyOrImplicitBodyRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        dynamicValidation.hasSuspenseAboveBody = true;
        return;
      } else if (hasSuspenseRegex.test(componentStack)) {
        dynamicValidation.hasAllowedDynamic = true;
        return;
      } else if (clientDynamic.syncDynamicErrorWithStack) {
        dynamicValidation.dynamicErrors.push(clientDynamic.syncDynamicErrorWithStack);
        return;
      } else {
        const message3 = `Route "${workStore.route}": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed outside of \`<Suspense>\`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/blocking-route`;
        const error = addErrorContext(Object.defineProperty(new Error(message3), "__NEXT_ERROR_CODE", {
          value: "E1083",
          enumerable: false,
          configurable: true
        }), componentStack, null);
        dynamicValidation.dynamicErrors.push(error);
        return;
      }
    }
    function addErrorContext(error, componentStack, createInstantStack) {
      const ownerStack = process.env.NODE_ENV !== "production" && _react.default.captureOwnerStack ? _react.default.captureOwnerStack() : null;
      if (createInstantStack !== null) {
        error.cause = createInstantStack();
      }
      error.stack = error.name + ": " + error.message + (ownerStack || componentStack);
      return error;
    }
    var PreludeState = /* @__PURE__ */ (function(PreludeState2) {
      PreludeState2[PreludeState2["Full"] = 0] = "Full";
      PreludeState2[PreludeState2["Empty"] = 1] = "Empty";
      PreludeState2[PreludeState2["Errored"] = 2] = "Errored";
      return PreludeState2;
    })({});
    function logDisallowedDynamicError(workStore, error) {
      console.error(error);
      if (process.env.NODE_ENV !== "development") {
        console.error(`To get a more detailed stack trace and pinpoint the issue, try one of the following:
  - Start the app in development mode by running \`next dev\`, then open "${workStore.route}" in your browser to investigate the error.
  - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.`);
      } else if (!process.env.__NEXT_DEV_SERVER) {
        console.error(`To debug the issue, start the app in development mode by running \`next dev\`, then open "${workStore.route}" in your browser to investigate the error.`);
      }
    }
    function throwIfDisallowedDynamic(workStore, prelude, dynamicValidation, serverDynamic) {
      if (serverDynamic.syncDynamicErrorWithStack) {
        logDisallowedDynamicError(workStore, serverDynamic.syncDynamicErrorWithStack);
        throw new _staticgenerationbailout.StaticGenBailoutError();
      }
      if (prelude !== 0) {
        if (dynamicValidation.hasSuspenseAboveBody) {
          return;
        }
        const dynamicErrors = dynamicValidation.dynamicErrors;
        if (dynamicErrors.length > 0) {
          for (let i = 0; i < dynamicErrors.length; i++) {
            logDisallowedDynamicError(workStore, dynamicErrors[i]);
          }
          throw new _staticgenerationbailout.StaticGenBailoutError();
        }
        if (dynamicValidation.hasDynamicViewport) {
          console.error(`Route "${workStore.route}" has a \`generateViewport\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport`);
          throw new _staticgenerationbailout.StaticGenBailoutError();
        }
        if (prelude === 1) {
          console.error(`Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason. This is a bug in Next.js.`);
          throw new _staticgenerationbailout.StaticGenBailoutError();
        }
      } else {
        if (dynamicValidation.hasAllowedDynamic === false && dynamicValidation.hasDynamicMetadata) {
          console.error(`Route "${workStore.route}" has a \`generateMetadata\` that depends on Request data (\`cookies()\`, etc...) or uncached external data (\`fetch(...)\`, etc...) when the rest of the route does not. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata`);
          throw new _staticgenerationbailout.StaticGenBailoutError();
        }
      }
    }
    function getStaticShellDisallowedDynamicReasons(workStore, prelude, dynamicValidation, configAllowsBlocking) {
      if (configAllowsBlocking || dynamicValidation.hasSuspenseAboveBody) {
        return [];
      }
      if (prelude !== 0) {
        const dynamicErrors = dynamicValidation.dynamicErrors;
        if (dynamicErrors.length > 0) {
          return dynamicErrors;
        }
        if (prelude === 1) {
          return [
            Object.defineProperty(new _invarianterror.InvariantError(`Route "${workStore.route}" did not produce a static shell and Next.js was unable to determine a reason.`), "__NEXT_ERROR_CODE", {
              value: "E936",
              enumerable: false,
              configurable: true
            })
          ];
        }
      } else {
        if (dynamicValidation.hasAllowedDynamic === false && dynamicValidation.dynamicErrors.length === 0 && dynamicValidation.dynamicMetadata) {
          return [
            dynamicValidation.dynamicMetadata
          ];
        }
      }
      return [];
    }
    function getNavigationDisallowedDynamicReasons(workStore, prelude, dynamicValidation, validationSampleTracking, boundaryState) {
      if (validationSampleTracking) {
        const { missingSampleErrors } = validationSampleTracking;
        if (missingSampleErrors.length > 0) {
          return missingSampleErrors;
        }
      }
      const { validationPreventingErrors } = dynamicValidation;
      if (validationPreventingErrors.length > 0) {
        return validationPreventingErrors;
      }
      if (boundaryState.renderedIds.size < boundaryState.expectedIds.size) {
        const { thrownErrorsOutsideBoundary, createInstantStack } = dynamicValidation;
        if (thrownErrorsOutsideBoundary.length === 0) {
          const message3 = `Route "${workStore.route}": Could not validate \`unstable_instant\` because the target segment was prevented from rendering for an unknown reason.`;
          const error = createInstantStack !== null ? createInstantStack() : new Error();
          error.name = "Error";
          error.message = message3;
          return [
            error
          ];
        } else if (thrownErrorsOutsideBoundary.length === 1) {
          const message3 = `Route "${workStore.route}": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to the following error.`;
          const error = createInstantStack !== null ? createInstantStack() : new Error();
          error.name = "Error";
          error.message = message3;
          return [
            error,
            thrownErrorsOutsideBoundary[0]
          ];
        } else {
          const message3 = `Route "${workStore.route}": Could not validate \`unstable_instant\` because the target segment was prevented from rendering, likely due to one of the following errors.`;
          const error = createInstantStack !== null ? createInstantStack() : new Error();
          error.name = "Error";
          error.message = message3;
          return [
            error,
            ...thrownErrorsOutsideBoundary
          ];
        }
      }
      if (prelude !== 0) {
        const dynamicErrors = dynamicValidation.dynamicErrors;
        if (dynamicErrors.length > 0) {
          return dynamicErrors;
        }
        if (prelude === 1) {
          if (dynamicValidation.hasAllowedClientDynamicAboveBoundary) {
            return [];
          }
          return [
            Object.defineProperty(new _invarianterror.InvariantError(`Route "${workStore.route}" failed to render during instant validation and Next.js was unable to determine a reason.`), "__NEXT_ERROR_CODE", {
              value: "E1055",
              enumerable: false,
              configurable: true
            })
          ];
        }
      } else {
        const dynamicErrors = dynamicValidation.dynamicErrors;
        if (dynamicErrors.length > 0) {
          return dynamicErrors;
        }
        if (dynamicValidation.hasAllowedDynamic === false && dynamicValidation.dynamicMetadata) {
          return [
            dynamicValidation.dynamicMetadata
          ];
        }
      }
      return [];
    }
  }
});

// node_modules/next/dist/server/create-deduped-by-callsite-server-error-logger.js
var require_create_deduped_by_callsite_server_error_logger = __commonJS({
  "node_modules/next/dist/server/create-deduped-by-callsite-server-error-logger.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "createDedupedByCallsiteServerErrorLoggerDev", {
      enumerable: true,
      get: function() {
        return createDedupedByCallsiteServerErrorLoggerDev;
      }
    });
    var _react = /* @__PURE__ */ _interop_require_wildcard(require_react());
    function _getRequireWildcardCache(nodeInterop) {
      if (typeof WeakMap !== "function") return null;
      var cacheBabelInterop = /* @__PURE__ */ new WeakMap();
      var cacheNodeInterop = /* @__PURE__ */ new WeakMap();
      return (_getRequireWildcardCache = function(nodeInterop2) {
        return nodeInterop2 ? cacheNodeInterop : cacheBabelInterop;
      })(nodeInterop);
    }
    function _interop_require_wildcard(obj, nodeInterop) {
      if (!nodeInterop && obj && obj.__esModule) {
        return obj;
      }
      if (obj === null || typeof obj !== "object" && typeof obj !== "function") {
        return {
          default: obj
        };
      }
      var cache2 = _getRequireWildcardCache(nodeInterop);
      if (cache2 && cache2.has(obj)) {
        return cache2.get(obj);
      }
      var newObj = {
        __proto__: null
      };
      var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor;
      for (var key2 in obj) {
        if (key2 !== "default" && Object.prototype.hasOwnProperty.call(obj, key2)) {
          var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key2) : null;
          if (desc && (desc.get || desc.set)) {
            Object.defineProperty(newObj, key2, desc);
          } else {
            newObj[key2] = obj[key2];
          }
        }
      }
      newObj.default = obj;
      if (cache2) {
        cache2.set(obj, newObj);
      }
      return newObj;
    }
    var errorRef = {
      current: null
    };
    var cache = typeof _react.cache === "function" ? _react.cache : (fn) => fn;
    var logErrorOrWarn = process.env.__NEXT_CACHE_COMPONENTS ? console.error : console.warn;
    var flushCurrentErrorIfNew = cache(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- cache key
      (key2) => {
        try {
          logErrorOrWarn(errorRef.current);
        } finally {
          errorRef.current = null;
        }
      }
    );
    function createDedupedByCallsiteServerErrorLoggerDev(getMessage) {
      return function logDedupedError(...args) {
        const message3 = getMessage(...args);
        if (process.env.NODE_ENV !== "production") {
          var _stack;
          const callStackFrames = (_stack = new Error().stack) == null ? void 0 : _stack.split("\n");
          if (callStackFrames === void 0 || callStackFrames.length < 4) {
            logErrorOrWarn(message3);
          } else {
            const key2 = callStackFrames[4];
            errorRef.current = message3;
            flushCurrentErrorIfNew(key2);
          }
        } else {
          logErrorOrWarn(message3);
        }
      };
    }
  }
});

// node_modules/next/dist/server/app-render/after-task-async-storage-instance.js
var require_after_task_async_storage_instance = __commonJS({
  "node_modules/next/dist/server/app-render/after-task-async-storage-instance.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "afterTaskAsyncStorageInstance", {
      enumerable: true,
      get: function() {
        return afterTaskAsyncStorageInstance;
      }
    });
    var _asynclocalstorage = require_async_local_storage();
    var afterTaskAsyncStorageInstance = (0, _asynclocalstorage.createAsyncLocalStorage)();
  }
});

// node_modules/next/dist/server/app-render/after-task-async-storage.external.js
var require_after_task_async_storage_external = __commonJS({
  "node_modules/next/dist/server/app-render/after-task-async-storage.external.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "afterTaskAsyncStorage", {
      enumerable: true,
      get: function() {
        return _aftertaskasyncstorageinstance.afterTaskAsyncStorageInstance;
      }
    });
    var _aftertaskasyncstorageinstance = require_after_task_async_storage_instance();
  }
});

// node_modules/next/dist/server/request/utils.js
var require_utils = __commonJS({
  "node_modules/next/dist/server/request/utils.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      isRequestAPICallableInsideAfter: function() {
        return isRequestAPICallableInsideAfter;
      },
      throwForSearchParamsAccessInUseCache: function() {
        return throwForSearchParamsAccessInUseCache;
      },
      throwWithStaticGenerationBailoutErrorWithDynamicError: function() {
        return throwWithStaticGenerationBailoutErrorWithDynamicError;
      }
    });
    var _staticgenerationbailout = require_static_generation_bailout();
    var _aftertaskasyncstorageexternal = require_after_task_async_storage_external();
    function throwWithStaticGenerationBailoutErrorWithDynamicError(route, expression) {
      throw Object.defineProperty(new _staticgenerationbailout.StaticGenBailoutError(`Route ${route} with \`dynamic = "error"\` couldn't be rendered statically because it used ${expression}. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`), "__NEXT_ERROR_CODE", {
        value: "E543",
        enumerable: false,
        configurable: true
      });
    }
    function throwForSearchParamsAccessInUseCache(workStore, constructorOpt) {
      const error = Object.defineProperty(new Error(`Route ${workStore.route} used \`searchParams\` inside "use cache". Accessing dynamic request data inside a cache scope is not supported. If you need some search params inside a cached function await \`searchParams\` outside of the cached function and pass only the required search params as arguments to the cached function. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`), "__NEXT_ERROR_CODE", {
        value: "E842",
        enumerable: false,
        configurable: true
      });
      Error.captureStackTrace(error, constructorOpt);
      workStore.invalidDynamicUsageError ??= error;
      throw error;
    }
    function isRequestAPICallableInsideAfter() {
      const afterTaskStore = _aftertaskasyncstorageexternal.afterTaskAsyncStorage.getStore();
      return (afterTaskStore == null ? void 0 : afterTaskStore.rootTaskSpawnPhase) === "action";
    }
  }
});

// node_modules/next/dist/server/request/cookies.js
var require_cookies3 = __commonJS({
  "node_modules/next/dist/server/request/cookies.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "cookies", {
      enumerable: true,
      get: function() {
        return cookies3;
      }
    });
    var _requestcookies = require_request_cookies();
    var _cookies = require_cookies2();
    var _workasyncstorageexternal = require_work_async_storage_external();
    var _workunitasyncstorageexternal = require_work_unit_async_storage_external();
    var _dynamicrendering = require_dynamic_rendering();
    var _staticgenerationbailout = require_static_generation_bailout();
    var _dynamicrenderingutils = require_dynamic_rendering_utils();
    var _creatededupedbycallsiteservererrorlogger = require_create_deduped_by_callsite_server_error_logger();
    var _utils = require_utils();
    var _invarianterror = require_invariant_error();
    var _stagedrendering = require_staged_rendering();
    function cookies3() {
      const callingExpression = "cookies";
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (workStore) {
        if (workUnitStore && workUnitStore.phase === "after" && !(0, _utils.isRequestAPICallableInsideAfter)()) {
          throw Object.defineProperty(new Error(
            // TODO(after): clarify that this only applies to pages?
            `Route ${workStore.route} used \`cookies()\` inside \`after()\`. This is not supported. If you need this data inside an \`after()\` callback, use \`cookies()\` outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`
          ), "__NEXT_ERROR_CODE", {
            value: "E843",
            enumerable: false,
            configurable: true
          });
        }
        if (workStore.forceStatic) {
          const underlyingCookies = createEmptyCookies();
          return makeUntrackedCookies(underlyingCookies);
        }
        if (workStore.dynamicShouldError) {
          throw Object.defineProperty(new _staticgenerationbailout.StaticGenBailoutError(`Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`cookies()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`), "__NEXT_ERROR_CODE", {
            value: "E849",
            enumerable: false,
            configurable: true
          });
        }
        if (workUnitStore) {
          switch (workUnitStore.type) {
            case "cache":
              const error = Object.defineProperty(new Error(`Route ${workStore.route} used \`cookies()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`), "__NEXT_ERROR_CODE", {
                value: "E831",
                enumerable: false,
                configurable: true
              });
              Error.captureStackTrace(error, cookies3);
              workStore.invalidDynamicUsageError ??= error;
              throw error;
            case "unstable-cache":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used \`cookies()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`cookies()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`), "__NEXT_ERROR_CODE", {
                value: "E846",
                enumerable: false,
                configurable: true
              });
            case "generate-static-params":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used \`cookies()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", {
                value: "E1123",
                enumerable: false,
                configurable: true
              });
            case "prerender":
              return makeHangingCookies(workStore, workUnitStore);
            case "prerender-client":
            case "validation-client":
              const exportName = "`cookies`";
              throw Object.defineProperty(new _invarianterror.InvariantError(`${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
                value: "E1037",
                enumerable: false,
                configurable: true
              });
            case "prerender-ppr":
              return (0, _dynamicrendering.postponeWithTracking)(workStore.route, callingExpression, workUnitStore.dynamicTracking);
            case "prerender-legacy":
              return (0, _dynamicrendering.throwToInterruptStaticGeneration)(callingExpression, workStore, workUnitStore);
            case "prerender-runtime":
              return (0, _dynamicrenderingutils.delayUntilRuntimeStage)(workUnitStore, makeUntrackedCookies(workUnitStore.cookies));
            case "private-cache":
              return makeUntrackedCookies(workUnitStore.cookies);
            case "request":
              (0, _dynamicrendering.trackDynamicDataInDynamicRender)(workUnitStore);
              let underlyingCookies;
              if ((0, _requestcookies.areCookiesMutableInCurrentPhase)(workUnitStore)) {
                underlyingCookies = workUnitStore.userspaceMutableCookies;
              } else {
                underlyingCookies = workUnitStore.cookies;
              }
              if (process.env.NODE_ENV === "development") {
                return makeUntrackedCookiesWithDevWarnings(workUnitStore, underlyingCookies, workStore == null ? void 0 : workStore.route);
              } else if (workUnitStore.asyncApiPromises) {
                const early = (0, _workunitasyncstorageexternal.isInEarlyRenderStage)(workUnitStore);
                if (underlyingCookies === workUnitStore.mutableCookies) {
                  return early ? workUnitStore.asyncApiPromises.earlyMutableCookies : workUnitStore.asyncApiPromises.mutableCookies;
                } else {
                  return early ? workUnitStore.asyncApiPromises.earlyCookies : workUnitStore.asyncApiPromises.cookies;
                }
              } else {
                return makeUntrackedCookies(underlyingCookies);
              }
            default:
              workUnitStore;
          }
        }
      }
      (0, _workunitasyncstorageexternal.throwForMissingRequestStore)(callingExpression);
    }
    function createEmptyCookies() {
      return _requestcookies.RequestCookiesAdapter.seal(new _cookies.RequestCookies(new Headers({})));
    }
    var CachedCookies = /* @__PURE__ */ new WeakMap();
    function makeHangingCookies(workStore, prerenderStore) {
      const cachedPromise = CachedCookies.get(prerenderStore);
      if (cachedPromise) {
        return cachedPromise;
      }
      const promise = (0, _dynamicrenderingutils.makeHangingPromise)(prerenderStore.renderSignal, workStore.route, "`cookies()`");
      CachedCookies.set(prerenderStore, promise);
      return promise;
    }
    function makeUntrackedCookies(underlyingCookies) {
      const cachedCookies = CachedCookies.get(underlyingCookies);
      if (cachedCookies) {
        return cachedCookies;
      }
      const promise = Promise.resolve(underlyingCookies);
      CachedCookies.set(underlyingCookies, promise);
      return promise;
    }
    function makeUntrackedCookiesWithDevWarnings(requestStore, underlyingCookies, route) {
      if (requestStore.asyncApiPromises) {
        const early = (0, _workunitasyncstorageexternal.isInEarlyRenderStage)(requestStore);
        let promise2;
        if (underlyingCookies === requestStore.mutableCookies) {
          promise2 = early ? requestStore.asyncApiPromises.earlyMutableCookies : requestStore.asyncApiPromises.mutableCookies;
        } else if (underlyingCookies === requestStore.cookies) {
          promise2 = early ? requestStore.asyncApiPromises.earlyCookies : requestStore.asyncApiPromises.cookies;
        } else {
          throw Object.defineProperty(new _invarianterror.InvariantError("Received an underlying cookies object that does not match either `cookies` or `mutableCookies`"), "__NEXT_ERROR_CODE", {
            value: "E890",
            enumerable: false,
            configurable: true
          });
        }
        return instrumentCookiesPromiseWithDevWarnings(promise2, route);
      }
      const cachedCookies = CachedCookies.get(underlyingCookies);
      if (cachedCookies) {
        return cachedCookies;
      }
      const promise = (0, _dynamicrenderingutils.makeDevtoolsIOAwarePromise)(underlyingCookies, requestStore, _stagedrendering.RenderStage.Runtime);
      const proxiedPromise = instrumentCookiesPromiseWithDevWarnings(promise, route);
      CachedCookies.set(underlyingCookies, proxiedPromise);
      return proxiedPromise;
    }
    var warnForSyncAccess = (0, _creatededupedbycallsiteservererrorlogger.createDedupedByCallsiteServerErrorLoggerDev)(createCookiesAccessError);
    function instrumentCookiesPromiseWithDevWarnings(promise, route) {
      Object.defineProperties(promise, {
        [Symbol.iterator]: replaceableWarningDescriptorForSymbolIterator(promise, route),
        size: replaceableWarningDescriptor(promise, "size", route),
        get: replaceableWarningDescriptor(promise, "get", route),
        getAll: replaceableWarningDescriptor(promise, "getAll", route),
        has: replaceableWarningDescriptor(promise, "has", route),
        set: replaceableWarningDescriptor(promise, "set", route),
        delete: replaceableWarningDescriptor(promise, "delete", route),
        clear: replaceableWarningDescriptor(promise, "clear", route),
        toString: replaceableWarningDescriptor(promise, "toString", route)
      });
      return promise;
    }
    function replaceableWarningDescriptor(target, prop, route) {
      return {
        enumerable: false,
        get() {
          warnForSyncAccess(route, `\`cookies().${prop}\``);
          return void 0;
        },
        set(value) {
          Object.defineProperty(target, prop, {
            value,
            writable: true,
            configurable: true
          });
        },
        configurable: true
      };
    }
    function replaceableWarningDescriptorForSymbolIterator(target, route) {
      return {
        enumerable: false,
        get() {
          warnForSyncAccess(route, "`...cookies()` or similar iteration");
          return void 0;
        },
        set(value) {
          Object.defineProperty(target, Symbol.iterator, {
            value,
            writable: true,
            enumerable: true,
            configurable: true
          });
        },
        configurable: true
      };
    }
    function createCookiesAccessError(route, expression) {
      const prefix = route ? `Route "${route}" ` : "This route ";
      return Object.defineProperty(new Error(`${prefix}used ${expression}. \`cookies()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`), "__NEXT_ERROR_CODE", {
        value: "E830",
        enumerable: false,
        configurable: true
      });
    }
  }
});

// node_modules/next/dist/server/web/spec-extension/adapters/headers.js
var require_headers = __commonJS({
  "node_modules/next/dist/server/web/spec-extension/adapters/headers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    function _export(target, all) {
      for (var name in all) Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
      });
    }
    _export(exports2, {
      HeadersAdapter: function() {
        return HeadersAdapter;
      },
      ReadonlyHeadersError: function() {
        return ReadonlyHeadersError;
      }
    });
    var _reflect = require_reflect();
    var ReadonlyHeadersError = class _ReadonlyHeadersError extends Error {
      constructor() {
        super("Headers cannot be modified. Read more: https://nextjs.org/docs/app/api-reference/functions/headers");
      }
      static callable() {
        throw new _ReadonlyHeadersError();
      }
    };
    var HeadersAdapter = class _HeadersAdapter extends Headers {
      constructor(headers) {
        super();
        this.headers = new Proxy(headers, {
          get(target, prop, receiver) {
            if (typeof prop === "symbol") {
              return _reflect.ReflectAdapter.get(target, prop, receiver);
            }
            const lowercased = prop.toLowerCase();
            const original = Object.keys(headers).find((o) => o.toLowerCase() === lowercased);
            if (typeof original === "undefined") return;
            return _reflect.ReflectAdapter.get(target, original, receiver);
          },
          set(target, prop, value, receiver) {
            if (typeof prop === "symbol") {
              return _reflect.ReflectAdapter.set(target, prop, value, receiver);
            }
            const lowercased = prop.toLowerCase();
            const original = Object.keys(headers).find((o) => o.toLowerCase() === lowercased);
            return _reflect.ReflectAdapter.set(target, original ?? prop, value, receiver);
          },
          has(target, prop) {
            if (typeof prop === "symbol") return _reflect.ReflectAdapter.has(target, prop);
            const lowercased = prop.toLowerCase();
            const original = Object.keys(headers).find((o) => o.toLowerCase() === lowercased);
            if (typeof original === "undefined") return false;
            return _reflect.ReflectAdapter.has(target, original);
          },
          deleteProperty(target, prop) {
            if (typeof prop === "symbol") return _reflect.ReflectAdapter.deleteProperty(target, prop);
            const lowercased = prop.toLowerCase();
            const original = Object.keys(headers).find((o) => o.toLowerCase() === lowercased);
            if (typeof original === "undefined") return true;
            return _reflect.ReflectAdapter.deleteProperty(target, original);
          }
        });
      }
      /**
      * Seals a Headers instance to prevent modification by throwing an error when
      * any mutating method is called.
      */
      static seal(headers) {
        return new Proxy(headers, {
          get(target, prop, receiver) {
            switch (prop) {
              case "append":
              case "delete":
              case "set":
                return ReadonlyHeadersError.callable;
              default:
                return _reflect.ReflectAdapter.get(target, prop, receiver);
            }
          }
        });
      }
      /**
      * Merges a header value into a string. This stores multiple values as an
      * array, so we need to merge them into a string.
      *
      * @param value a header value
      * @returns a merged header value (a string)
      */
      merge(value) {
        if (Array.isArray(value)) return value.join(", ");
        return value;
      }
      /**
      * Creates a Headers instance from a plain object or a Headers instance.
      *
      * @param headers a plain object or a Headers instance
      * @returns a headers instance
      */
      static from(headers) {
        if (headers instanceof Headers) return headers;
        return new _HeadersAdapter(headers);
      }
      append(name, value) {
        const existing = this.headers[name];
        if (typeof existing === "string") {
          this.headers[name] = [
            existing,
            value
          ];
        } else if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          this.headers[name] = value;
        }
      }
      delete(name) {
        delete this.headers[name];
      }
      get(name) {
        const value = this.headers[name];
        if (typeof value !== "undefined") return this.merge(value);
        return null;
      }
      has(name) {
        return typeof this.headers[name] !== "undefined";
      }
      set(name, value) {
        this.headers[name] = value;
      }
      forEach(callbackfn, thisArg) {
        for (const [name, value] of this.entries()) {
          callbackfn.call(thisArg, value, name, this);
        }
      }
      *entries() {
        for (const key2 of Object.keys(this.headers)) {
          const name = key2.toLowerCase();
          const value = this.get(name);
          yield [
            name,
            value
          ];
        }
      }
      *keys() {
        for (const key2 of Object.keys(this.headers)) {
          const name = key2.toLowerCase();
          yield name;
        }
      }
      *values() {
        for (const key2 of Object.keys(this.headers)) {
          const value = this.get(key2);
          yield value;
        }
      }
      [Symbol.iterator]() {
        return this.entries();
      }
    };
  }
});

// node_modules/next/dist/server/request/headers.js
var require_headers2 = __commonJS({
  "node_modules/next/dist/server/request/headers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "headers", {
      enumerable: true,
      get: function() {
        return headers;
      }
    });
    var _headers = require_headers();
    var _workasyncstorageexternal = require_work_async_storage_external();
    var _workunitasyncstorageexternal = require_work_unit_async_storage_external();
    var _dynamicrendering = require_dynamic_rendering();
    var _staticgenerationbailout = require_static_generation_bailout();
    var _dynamicrenderingutils = require_dynamic_rendering_utils();
    var _creatededupedbycallsiteservererrorlogger = require_create_deduped_by_callsite_server_error_logger();
    var _utils = require_utils();
    var _invarianterror = require_invariant_error();
    var _stagedrendering = require_staged_rendering();
    function headers() {
      const callingExpression = "headers";
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (workStore) {
        if (workUnitStore && workUnitStore.phase === "after" && !(0, _utils.isRequestAPICallableInsideAfter)()) {
          throw Object.defineProperty(new Error(`Route ${workStore.route} used \`headers()\` inside \`after()\`. This is not supported. If you need this data inside an \`after()\` callback, use \`headers()\` outside of the callback. See more info here: https://nextjs.org/docs/canary/app/api-reference/functions/after`), "__NEXT_ERROR_CODE", {
            value: "E839",
            enumerable: false,
            configurable: true
          });
        }
        if (workStore.forceStatic) {
          const underlyingHeaders = _headers.HeadersAdapter.seal(new Headers({}));
          return makeUntrackedHeaders(underlyingHeaders);
        }
        if (workUnitStore) {
          switch (workUnitStore.type) {
            case "cache": {
              const error = Object.defineProperty(new Error(`Route ${workStore.route} used \`headers()\` inside "use cache". Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`), "__NEXT_ERROR_CODE", {
                value: "E833",
                enumerable: false,
                configurable: true
              });
              Error.captureStackTrace(error, headers);
              workStore.invalidDynamicUsageError ??= error;
              throw error;
            }
            case "unstable-cache":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used \`headers()\` inside a function cached with \`unstable_cache()\`. Accessing Dynamic data sources inside a cache scope is not supported. If you need this data inside a cached function use \`headers()\` outside of the cached function and pass the required dynamic data in as an argument. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`), "__NEXT_ERROR_CODE", {
                value: "E838",
                enumerable: false,
                configurable: true
              });
            case "generate-static-params":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used \`headers()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", {
                value: "E1134",
                enumerable: false,
                configurable: true
              });
            case "prerender":
            case "prerender-client":
            case "validation-client":
            case "private-cache":
            case "prerender-runtime":
            case "prerender-ppr":
            case "prerender-legacy":
            case "request":
              break;
            default:
              workUnitStore;
          }
        }
        if (workStore.dynamicShouldError) {
          throw Object.defineProperty(new _staticgenerationbailout.StaticGenBailoutError(`Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`headers()\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`), "__NEXT_ERROR_CODE", {
            value: "E828",
            enumerable: false,
            configurable: true
          });
        }
        if (workUnitStore) {
          switch (workUnitStore.type) {
            case "prerender":
              return makeHangingHeaders(workStore, workUnitStore);
            case "prerender-client":
            case "validation-client":
              const exportName = "`headers`";
              throw Object.defineProperty(new _invarianterror.InvariantError(`${exportName} must not be used within a client component. Next.js should be preventing ${exportName} from being included in client components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
                value: "E1017",
                enumerable: false,
                configurable: true
              });
            case "prerender-ppr":
              return (0, _dynamicrendering.postponeWithTracking)(workStore.route, callingExpression, workUnitStore.dynamicTracking);
            case "prerender-legacy":
              return (0, _dynamicrendering.throwToInterruptStaticGeneration)(callingExpression, workStore, workUnitStore);
            case "prerender-runtime":
              return (0, _dynamicrenderingutils.delayUntilRuntimeStage)(workUnitStore, makeUntrackedHeaders(workUnitStore.headers));
            case "private-cache":
              return makeUntrackedHeaders(workUnitStore.headers);
            case "request":
              (0, _dynamicrendering.trackDynamicDataInDynamicRender)(workUnitStore);
              if (process.env.NODE_ENV === "development") {
                return makeUntrackedHeadersWithDevWarnings(workUnitStore.headers, workStore == null ? void 0 : workStore.route, workUnitStore);
              } else if (workUnitStore.asyncApiPromises) {
                return (0, _workunitasyncstorageexternal.isInEarlyRenderStage)(workUnitStore) ? workUnitStore.asyncApiPromises.earlyHeaders : workUnitStore.asyncApiPromises.headers;
              } else {
                return makeUntrackedHeaders(workUnitStore.headers);
              }
              break;
            default:
              workUnitStore;
          }
        }
      }
      (0, _workunitasyncstorageexternal.throwForMissingRequestStore)(callingExpression);
    }
    var CachedHeaders = /* @__PURE__ */ new WeakMap();
    function makeHangingHeaders(workStore, prerenderStore) {
      const cachedHeaders = CachedHeaders.get(prerenderStore);
      if (cachedHeaders) {
        return cachedHeaders;
      }
      const promise = (0, _dynamicrenderingutils.makeHangingPromise)(prerenderStore.renderSignal, workStore.route, "`headers()`");
      CachedHeaders.set(prerenderStore, promise);
      return promise;
    }
    function makeUntrackedHeaders(underlyingHeaders) {
      const cachedHeaders = CachedHeaders.get(underlyingHeaders);
      if (cachedHeaders) {
        return cachedHeaders;
      }
      const promise = Promise.resolve(underlyingHeaders);
      CachedHeaders.set(underlyingHeaders, promise);
      return promise;
    }
    function makeUntrackedHeadersWithDevWarnings(underlyingHeaders, route, requestStore) {
      if (requestStore.asyncApiPromises) {
        const promise2 = (0, _workunitasyncstorageexternal.isInEarlyRenderStage)(requestStore) ? requestStore.asyncApiPromises.earlyHeaders : requestStore.asyncApiPromises.headers;
        return instrumentHeadersPromiseWithDevWarnings(promise2, route);
      }
      const cachedHeaders = CachedHeaders.get(underlyingHeaders);
      if (cachedHeaders) {
        return cachedHeaders;
      }
      const promise = (0, _dynamicrenderingutils.makeDevtoolsIOAwarePromise)(underlyingHeaders, requestStore, _stagedrendering.RenderStage.Runtime);
      const proxiedPromise = instrumentHeadersPromiseWithDevWarnings(promise, route);
      CachedHeaders.set(underlyingHeaders, proxiedPromise);
      return proxiedPromise;
    }
    var warnForSyncAccess = (0, _creatededupedbycallsiteservererrorlogger.createDedupedByCallsiteServerErrorLoggerDev)(createHeadersAccessError);
    function instrumentHeadersPromiseWithDevWarnings(promise, route) {
      Object.defineProperties(promise, {
        [Symbol.iterator]: replaceableWarningDescriptorForSymbolIterator(promise, route),
        append: replaceableWarningDescriptor(promise, "append", route),
        delete: replaceableWarningDescriptor(promise, "delete", route),
        get: replaceableWarningDescriptor(promise, "get", route),
        has: replaceableWarningDescriptor(promise, "has", route),
        set: replaceableWarningDescriptor(promise, "set", route),
        getSetCookie: replaceableWarningDescriptor(promise, "getSetCookie", route),
        forEach: replaceableWarningDescriptor(promise, "forEach", route),
        keys: replaceableWarningDescriptor(promise, "keys", route),
        values: replaceableWarningDescriptor(promise, "values", route),
        entries: replaceableWarningDescriptor(promise, "entries", route)
      });
      return promise;
    }
    function replaceableWarningDescriptor(target, prop, route) {
      return {
        enumerable: false,
        get() {
          warnForSyncAccess(route, `\`headers().${prop}\``);
          return void 0;
        },
        set(value) {
          Object.defineProperty(target, prop, {
            value,
            writable: true,
            configurable: true
          });
        },
        configurable: true
      };
    }
    function replaceableWarningDescriptorForSymbolIterator(target, route) {
      return {
        enumerable: false,
        get() {
          warnForSyncAccess(route, "`...headers()` or similar iteration");
          return void 0;
        },
        set(value) {
          Object.defineProperty(target, Symbol.iterator, {
            value,
            writable: true,
            enumerable: true,
            configurable: true
          });
        },
        configurable: true
      };
    }
    function createHeadersAccessError(route, expression) {
      const prefix = route ? `Route "${route}" ` : "This route ";
      return Object.defineProperty(new Error(`${prefix}used ${expression}. \`headers()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`), "__NEXT_ERROR_CODE", {
        value: "E836",
        enumerable: false,
        configurable: true
      });
    }
  }
});

// node_modules/next/dist/server/request/draft-mode.js
var require_draft_mode = __commonJS({
  "node_modules/next/dist/server/request/draft-mode.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "draftMode", {
      enumerable: true,
      get: function() {
        return draftMode;
      }
    });
    var _workunitasyncstorageexternal = require_work_unit_async_storage_external();
    var _workasyncstorageexternal = require_work_async_storage_external();
    var _dynamicrendering = require_dynamic_rendering();
    var _creatededupedbycallsiteservererrorlogger = require_create_deduped_by_callsite_server_error_logger();
    var _staticgenerationbailout = require_static_generation_bailout();
    var _hooksservercontext = require_hooks_server_context();
    var _invarianterror = require_invariant_error();
    var _dynamicrenderingutils = require_dynamic_rendering_utils();
    var _reflect = require_reflect();
    function draftMode() {
      const callingExpression = "draftMode";
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (!workStore || !workUnitStore) {
        (0, _workunitasyncstorageexternal.throwForMissingRequestStore)(callingExpression);
      }
      switch (workUnitStore.type) {
        case "prerender-runtime":
          return (0, _dynamicrenderingutils.delayUntilRuntimeStage)(workUnitStore, createOrGetCachedDraftMode(workUnitStore.draftMode, workStore));
        case "request":
          return createOrGetCachedDraftMode(workUnitStore.draftMode, workStore);
        case "cache":
        case "private-cache":
        case "unstable-cache":
          const draftModeProvider = (0, _workunitasyncstorageexternal.getDraftModeProviderForCacheScope)(workStore, workUnitStore);
          if (draftModeProvider) {
            return createOrGetCachedDraftMode(draftModeProvider, workStore);
          }
        // Otherwise, we fall through to providing an empty draft mode.
        // eslint-disable-next-line no-fallthrough
        case "prerender":
        case "prerender-ppr":
        case "prerender-legacy":
          return createOrGetCachedDraftMode(null, workStore);
        case "prerender-client":
        case "validation-client": {
          const exportName = "`draftMode`";
          throw Object.defineProperty(new _invarianterror.InvariantError(`${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
            value: "E1046",
            enumerable: false,
            configurable: true
          });
        }
        case "generate-static-params":
          throw Object.defineProperty(new Error(`Route ${workStore.route} used \`${callingExpression}()\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", {
            value: "E1132",
            enumerable: false,
            configurable: true
          });
        default:
          return workUnitStore;
      }
    }
    function createOrGetCachedDraftMode(draftModeProvider, workStore) {
      const cacheKey = draftModeProvider ?? NullDraftMode;
      const cachedDraftMode = CachedDraftModes.get(cacheKey);
      if (cachedDraftMode) {
        return cachedDraftMode;
      }
      if (process.env.NODE_ENV === "development" && !(workStore == null ? void 0 : workStore.isPrefetchRequest)) {
        const route = workStore == null ? void 0 : workStore.route;
        return createDraftModeWithDevWarnings(draftModeProvider, route);
      } else {
        return Promise.resolve(new DraftMode(draftModeProvider));
      }
    }
    var NullDraftMode = {};
    var CachedDraftModes = /* @__PURE__ */ new WeakMap();
    function createDraftModeWithDevWarnings(underlyingProvider, route) {
      const instance = new DraftMode(underlyingProvider);
      const promise = Promise.resolve(instance);
      const proxiedPromise = new Proxy(promise, {
        get(target, prop, receiver) {
          switch (prop) {
            case "isEnabled":
              warnForSyncAccess(route, `\`draftMode().${prop}\``);
              break;
            case "enable":
            case "disable": {
              warnForSyncAccess(route, `\`draftMode().${prop}()\``);
              break;
            }
            default: {
            }
          }
          return _reflect.ReflectAdapter.get(target, prop, receiver);
        }
      });
      return proxiedPromise;
    }
    var DraftMode = class {
      constructor(provider) {
        this._provider = provider;
      }
      get isEnabled() {
        if (this._provider !== null) {
          return this._provider.isEnabled;
        }
        return false;
      }
      enable() {
        trackDynamicDraftMode("draftMode().enable()", this.enable);
        if (this._provider !== null) {
          this._provider.enable();
        }
      }
      disable() {
        trackDynamicDraftMode("draftMode().disable()", this.disable);
        if (this._provider !== null) {
          this._provider.disable();
        }
      }
    };
    var warnForSyncAccess = (0, _creatededupedbycallsiteservererrorlogger.createDedupedByCallsiteServerErrorLoggerDev)(createDraftModeAccessError);
    function createDraftModeAccessError(route, expression) {
      const prefix = route ? `Route "${route}" ` : "This route ";
      return Object.defineProperty(new Error(`${prefix}used ${expression}. \`draftMode()\` returns a Promise and must be unwrapped with \`await\` or \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis`), "__NEXT_ERROR_CODE", {
        value: "E835",
        enumerable: false,
        configurable: true
      });
    }
    function trackDynamicDraftMode(expression, constructorOpt) {
      const workStore = _workasyncstorageexternal.workAsyncStorage.getStore();
      const workUnitStore = _workunitasyncstorageexternal.workUnitAsyncStorage.getStore();
      if (workStore) {
        if ((workUnitStore == null ? void 0 : workUnitStore.phase) === "after") {
          throw Object.defineProperty(new Error(`Route ${workStore.route} used "${expression}" inside \`after()\`. The enabled status of \`draftMode()\` can be read inside \`after()\` but you cannot enable or disable \`draftMode()\`. See more info here: https://nextjs.org/docs/app/api-reference/functions/after`), "__NEXT_ERROR_CODE", {
            value: "E845",
            enumerable: false,
            configurable: true
          });
        }
        if (workStore.dynamicShouldError) {
          throw Object.defineProperty(new _staticgenerationbailout.StaticGenBailoutError(`Route ${workStore.route} with \`dynamic = "error"\` couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic#dynamic-rendering`), "__NEXT_ERROR_CODE", {
            value: "E553",
            enumerable: false,
            configurable: true
          });
        }
        if (workUnitStore) {
          switch (workUnitStore.type) {
            case "cache":
            case "private-cache": {
              const error = Object.defineProperty(new Error(`Route ${workStore.route} used "${expression}" inside "use cache". The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/messages/next-request-in-use-cache`), "__NEXT_ERROR_CODE", {
                value: "E829",
                enumerable: false,
                configurable: true
              });
              Error.captureStackTrace(error, constructorOpt);
              workStore.invalidDynamicUsageError ??= error;
              throw error;
            }
            case "unstable-cache":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used "${expression}" inside a function cached with \`unstable_cache()\`. The enabled status of \`draftMode()\` can be read in caches but you must not enable or disable \`draftMode()\` inside a cache. See more info here: https://nextjs.org/docs/app/api-reference/functions/unstable_cache`), "__NEXT_ERROR_CODE", {
                value: "E844",
                enumerable: false,
                configurable: true
              });
            case "prerender":
            case "prerender-runtime": {
              const error = Object.defineProperty(new Error(`Route ${workStore.route} used ${expression} without first calling \`await connection()\`. See more info here: https://nextjs.org/docs/messages/next-prerender-sync-headers`), "__NEXT_ERROR_CODE", {
                value: "E126",
                enumerable: false,
                configurable: true
              });
              return (0, _dynamicrendering.abortAndThrowOnSynchronousRequestDataAccess)(workStore.route, expression, error, workUnitStore);
            }
            case "prerender-client":
            case "validation-client":
              const exportName = "`draftMode`";
              throw Object.defineProperty(new _invarianterror.InvariantError(`${exportName} must not be used within a Client Component. Next.js should be preventing ${exportName} from being included in Client Components statically, but did not in this case.`), "__NEXT_ERROR_CODE", {
                value: "E1046",
                enumerable: false,
                configurable: true
              });
            case "prerender-ppr":
              return (0, _dynamicrendering.postponeWithTracking)(workStore.route, expression, workUnitStore.dynamicTracking);
            case "prerender-legacy":
              workUnitStore.revalidate = 0;
              const err = Object.defineProperty(new _hooksservercontext.DynamicServerError(`Route ${workStore.route} couldn't be rendered statically because it used \`${expression}\`. See more info here: https://nextjs.org/docs/messages/dynamic-server-error`), "__NEXT_ERROR_CODE", {
                value: "E558",
                enumerable: false,
                configurable: true
              });
              workStore.dynamicUsageDescription = expression;
              workStore.dynamicUsageStack = err.stack;
              throw err;
            case "request":
              (0, _dynamicrendering.trackDynamicDataInDynamicRender)(workUnitStore);
              break;
            case "generate-static-params":
              throw Object.defineProperty(new Error(`Route ${workStore.route} used \`${expression}\` inside \`generateStaticParams\`. This is not supported because \`generateStaticParams\` runs at build time without an HTTP request. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context`), "__NEXT_ERROR_CODE", {
                value: "E1121",
                enumerable: false,
                configurable: true
              });
            default:
              workUnitStore;
          }
        }
      }
    }
  }
});

// node_modules/next/headers.js
var require_headers3 = __commonJS({
  "node_modules/next/headers.js"(exports2, module2) {
    module2.exports.cookies = require_cookies3().cookies;
    module2.exports.headers = require_headers2().headers;
    module2.exports.draftMode = require_draft_mode().draftMode;
  }
});

// src/lib/session.ts
function uuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}
function isProd() {
  return process.env.NODE_ENV === "production";
}
async function encryptJwt(payload, expiresIn) {
  return await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expiresIn).sign(key);
}
async function decryptJwt(token) {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload;
  } catch (err) {
    return null;
  }
}
function expiryDateFromDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
}
function expiryDateFromMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1e3);
}
async function getSession(options) {
  const allowRefresh = options?.allowRefresh !== false;
  const cookiesStore = await (0, import_headers.cookies)();
  const access = cookiesStore.get("accessToken")?.value;
  const refresh = cookiesStore.get("refreshToken")?.value;
  if (access) {
    const payload = await decryptJwt(access);
    if (payload?.userId && payload?.sessionId) {
      try {
        const { default: prisma2 } = await Promise.resolve().then(() => (init_prisma(), prisma_exports));
        const sessionRecord = await prisma2.session.findUnique({ where: { id: payload.sessionId } });
        if (sessionRecord && !sessionRecord.revoked && sessionRecord.expiresAt > /* @__PURE__ */ new Date() && sessionRecord.userId === payload.userId) {
          if (payload?.jti && sessionRecord.jti && payload.jti !== sessionRecord.jti) {
            return null;
          }
          const currentRefresh = cookiesStore.get("refreshToken")?.value;
          if (!currentRefresh || currentRefresh !== sessionRecord.refreshToken) {
            return null;
          }
          await prisma2.session.update({ where: { id: sessionRecord.id }, data: { lastActivity: /* @__PURE__ */ new Date() } });
          return payload;
        }
      } catch (e) {
        console.error("Error validating access token session in getSession:", e);
        return null;
      }
    }
  }
  if (refresh) {
    try {
      const { default: prisma2 } = await Promise.resolve().then(() => (init_prisma(), prisma_exports));
      const sessionRecord = await prisma2.session.findUnique({ where: { refreshToken: refresh } });
      if (!sessionRecord) return null;
      if (sessionRecord.revoked) return null;
      if (sessionRecord.expiresAt < /* @__PURE__ */ new Date()) return null;
      if (!allowRefresh) {
        const userWithRole2 = await prisma2.user.findUnique({ where: { id: sessionRecord.userId }, include: { role: true } });
        if (!userWithRole2) return null;
        await prisma2.session.update({ where: { id: sessionRecord.id }, data: { lastActivity: /* @__PURE__ */ new Date() } });
        return {
          userId: sessionRecord.userId,
          sessionId: sessionRecord.id,
          jti: sessionRecord.jti,
          passwordChangeRequired: userWithRole2.passwordChangeRequired
        };
      }
      const newRefreshToken = await encryptJwt({ userId: sessionRecord.userId, t: "refresh" }, `${REFRESH_TOKEN_DAYS}d`);
      const refreshExpiresAt = expiryDateFromDays(REFRESH_TOKEN_DAYS);
      const userWithRole = await prisma2.user.findUnique({ where: { id: sessionRecord.userId }, include: { role: true } });
      if (!userWithRole) return null;
      const newJti = uuid();
      await prisma2.session.update({ where: { id: sessionRecord.id }, data: { refreshToken: newRefreshToken, expiresAt: refreshExpiresAt, lastActivity: /* @__PURE__ */ new Date(), jti: newJti } });
      const accessPayload = {
        userId: sessionRecord.userId,
        sessionId: sessionRecord.id,
        // include the new jti so access tokens can be revoked by comparing against DB
        jti: await (async () => {
          try {
            const { default: prisma22 } = await Promise.resolve().then(() => (init_prisma(), prisma_exports));
            const updated = await prisma22.session.findUnique({ where: { id: sessionRecord.id } });
            return updated?.jti;
          } catch (e) {
            return void 0;
          }
        })(),
        // Do not include permissions in the token; fetch from DB for authoritative source.
        passwordChangeRequired: userWithRole.passwordChangeRequired
      };
      const newAccessToken = await encryptJwt(accessPayload, ACCESS_TOKEN_EXP);
      const accessExpires = expiryDateFromMinutes(15);
      const cookiesStore2 = await (0, import_headers.cookies)();
      cookiesStore2.set("accessToken", newAccessToken, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", expires: accessExpires });
      cookiesStore2.set("refreshToken", newRefreshToken, { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", expires: refreshExpiresAt });
      return accessPayload;
    } catch (e) {
      console.error("Refresh flow failed in getSession:", e);
      return null;
    }
  }
  try {
    const legacyJwt = cookiesStore.get("session")?.value;
    if (legacyJwt) {
      const legacyPayload = await decryptJwt(legacyJwt);
      if (legacyPayload?.superAppToken) {
        return legacyPayload;
      }
    }
    const directToken = cookiesStore.get("superAppToken")?.value;
    if (directToken) {
      return { superAppToken: directToken };
    }
  } catch (e) {
    console.error("Error reading legacy session or superAppToken cookie in getSession:", e);
    return null;
  }
  return null;
}
async function deleteSession() {
  const cookiesStore = await (0, import_headers.cookies)();
  const refresh = cookiesStore.get("refreshToken")?.value;
  const access = cookiesStore.get("accessToken")?.value;
  if (refresh) {
    try {
      const { default: prisma2 } = await Promise.resolve().then(() => (init_prisma(), prisma_exports));
      const sessionRecord = await prisma2.session.findUnique({ where: { refreshToken: refresh } });
      if (sessionRecord) {
        await prisma2.session.update({ where: { id: sessionRecord.id }, data: { revoked: true, jti: null } });
      }
    } catch (e) {
      console.error("Failed to revoke session by refresh token in deleteSession:", e);
    }
  } else if (access) {
    const payload = await decryptJwt(access);
    if (payload?.sessionId) {
      try {
        const { default: prisma2 } = await Promise.resolve().then(() => (init_prisma(), prisma_exports));
        await prisma2.session.update({ where: { id: payload.sessionId }, data: { revoked: true, jti: null } });
      } catch (e) {
        console.error("Failed to revoke session by access token in deleteSession:", e);
      }
    }
  }
  const expired = /* @__PURE__ */ new Date(0);
  cookiesStore.set("accessToken", "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", expires: expired });
  cookiesStore.set("refreshToken", "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", expires: expired });
  cookiesStore.set("session", "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", expires: expired });
}
var import_headers, secretKey, key, ACCESS_TOKEN_EXP, REFRESH_TOKEN_DAYS;
var init_session = __esm({
  "src/lib/session.ts"() {
    "use strict";
    "use server";
    init_esm();
    import_headers = __toESM(require_headers3());
    secretKey = process.env.SESSION_SECRET;
    key = new TextEncoder().encode(secretKey);
    ACCESS_TOKEN_EXP = "15m";
    REFRESH_TOKEN_DAYS = 7;
  }
});

// src/lib/branch-filter.ts
function parseManagedBranchCodes(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const codes = parsed.map((v) => typeof v === "number" ? v : parseInt(String(v), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return codes.length > 0 ? codes : null;
  } catch {
    return null;
  }
}
var init_branch_filter = __esm({
  "src/lib/branch-filter.ts"() {
    "use strict";
    init_prisma();
  }
});

// src/lib/user.ts
async function getUserFromSession(options) {
  try {
    let session = await getSession({ allowRefresh: options?.allowRefresh });
    if (!session) {
      return null;
    }
    if (!session?.userId) {
      return null;
    }
    const user = await prisma_default.user.findUnique({
      where: { id: session.userId },
      include: {
        role: true,
        loanProvider: true
      }
    });
    if (!user) {
      return null;
    }
    if (user.status === "Inactive") {
      try {
        await deleteSession();
      } catch (_) {
      }
      return null;
    }
    const { password, ...userWithoutPassword } = user;
    const authUser = {
      ...userWithoutPassword,
      role: user.role.name,
      providerName: user.loanProvider?.name,
      permissions: JSON.parse(user.role.permissions),
      managedBranchCodes: parseManagedBranchCodes(user.managedBranchCodes),
      passwordChangeRequired: user.passwordChangeRequired
    };
    return authUser;
  } catch (error) {
    const msg = error?.message ? String(error.message) : "";
    if (msg.includes("Cookies can only be modified in a Server Action or Route Handler")) {
      try {
        const session = await getSession({ allowRefresh: false });
        if (!session?.userId) return null;
        const user = await prisma_default.user.findUnique({
          where: { id: session.userId },
          include: { role: true, loanProvider: true }
        });
        if (!user) return null;
        if (user.status === "Inactive") return null;
        const { password, ...userWithoutPassword } = user;
        const authUser = {
          ...userWithoutPassword,
          role: user.role.name,
          providerName: user.loanProvider?.name,
          permissions: JSON.parse(user.role.permissions),
          managedBranchCodes: parseManagedBranchCodes(user.managedBranchCodes),
          passwordChangeRequired: user.passwordChangeRequired
        };
        return authUser;
      } catch (_) {
        return null;
      }
    }
    const e = error;
    if (e && (e.name === "PrismaClientKnownRequestError" || typeof e.code === "string")) {
    }
    console.error("Get User Error:", error);
    return null;
  }
}
var import_headers2;
var init_user = __esm({
  "src/lib/user.ts"() {
    "use strict";
    "use server";
    init_session();
    init_prisma();
    init_branch_filter();
    import_headers2 = __toESM(require_headers3());
  }
});

// src/actions/npl.ts
var npl_exports = {};
__export(npl_exports, {
  updateNplStatus: () => updateNplStatus,
  updateNplStatusJob: () => updateNplStatusJob
});
async function updateNplStatusInternal() {
  const providers = await prisma_default.loanProvider.findMany({
    select: {
      id: true,
      nplThresholdDays: true,
      products: {
        select: {
          id: true
        }
      }
    }
  });
  if (providers.length === 0) {
    return { success: true, message: "No providers to process.", updatedCount: 0 };
  }
  let totalUpdatedCount = 0;
  for (const provider of providers) {
    const nplThresholdDate = subDays(/* @__PURE__ */ new Date(), provider.nplThresholdDays);
    const productIds = provider.products.map((p) => p.id);
    if (productIds.length === 0) continue;
    const overdueLoans = await prisma_default.loan.findMany({
      where: {
        productId: { in: productIds },
        repaymentStatus: "Unpaid",
        disbursedDate: {
          lt: nplThresholdDate
        }
      },
      select: {
        borrowerId: true
      }
    });
    if (overdueLoans.length === 0) {
      continue;
    }
    const borrowerIdsToFlag = [...new Set(overdueLoans.map((loan) => loan.borrowerId))];
    try {
      const CHUNK_SIZE = 1e3;
      const borrowersToFlag = [];
      for (let i = 0; i < borrowerIdsToFlag.length; i += CHUNK_SIZE) {
        const chunk = borrowerIdsToFlag.slice(i, i + CHUNK_SIZE);
        const found = await prisma_default.borrower.findMany({ where: { id: { in: chunk }, status: { not: "NPL" } }, select: { id: true } });
        borrowersToFlag.push(...found);
      }
      if (borrowersToFlag.length === 0) continue;
      const idsToUpdate = borrowersToFlag.map((b) => b.id);
      for (let i = 0; i < idsToUpdate.length; i += CHUNK_SIZE) {
        const chunk = idsToUpdate.slice(i, i + CHUNK_SIZE);
        const { count } = await prisma_default.borrower.updateMany({ where: { id: { in: chunk } }, data: { status: "NPL" } });
        totalUpdatedCount += count;
      }
      for (const b of borrowersToFlag) {
        (async () => {
          try {
            const phone = b.id;
            const msg = `Your loan account has been flagged as Non-Performing Loan (NPL). Please contact support to regularize your account.`;
            const smsRes = await sms_default(String(phone), msg);
            if (!smsRes.ok) console.warn("[npl] sms send failed", smsRes);
          } catch (e) {
            console.error("[npl] sms notify error", e);
          }
        })();
      }
    } catch (error) {
      console.error(`Failed to update NPL statuses for provider ${provider.id}:`, error);
    }
  }
  return { success: true, message: `Successfully updated a total of ${totalUpdatedCount} borrowers to NPL status.`, updatedCount: totalUpdatedCount };
}
async function updateNplStatusJob() {
  return updateNplStatusInternal();
}
async function updateNplStatus() {
  const user = await getUserFromSession({ allowRefresh: false });
  if (!user?.id) {
    return { success: false, message: "Not authenticated", updatedCount: 0 };
  }
  const allowed = !!user.permissions?.["npl"]?.update;
  if (!allowed) {
    return { success: false, message: "Not authorized", updatedCount: 0 };
  }
  return updateNplStatusInternal();
}
var init_npl = __esm({
  "src/actions/npl.ts"() {
    "use strict";
    "use server";
    init_prisma();
    init_date_fns();
    init_sms();
    init_user();
  }
});

// src/lib/cbs-npl/client.ts
function getCbsBaseUrl() {
  return (process.env.CBS_NPL_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}
function getOutboundAuthHeader() {
  const token = process.env.CBS_NPL_AUTH_TOKEN?.trim();
  if (token) {
    return { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` };
  }
  const username = process.env.CBS_NPL_USERNAME?.trim();
  const password = process.env.CBS_NPL_PASSWORD ?? "";
  if (username) {
    const encoded = Buffer.from(`${username}:${password}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}
function getDefaultCbsProviderId() {
  return process.env.CBS_DEFAULT_PROVIDER_ID?.trim() || "PRO0001";
}
function getCbsBulkMaxAccountsPerRequest() {
  const raw = Number(process.env.CBS_NPL_BULK_MAX_ACCOUNTS ?? 1e3);
  if (!Number.isFinite(raw) || raw < 1) return 1e3;
  return Math.floor(raw);
}
function chunkArray(items, chunkSize) {
  if (chunkSize < 1) return [items];
  const out = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}
async function cbsRequest(method, path2, body, opts) {
  const url = `${getCbsBaseUrl()}${path2}`;
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.CBS_NPL_TIMEOUT_MS ?? 2e4);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  void logger_default.info(`[CBS-NPL] ${method} ${url}`);
  let status = 0;
  let raw;
  let parsed;
  let error;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getOutboundAuthHeader()
      },
      ...body !== void 0 ? { body: JSON.stringify(body) } : {},
      signal: controller.signal,
      cache: "no-store"
    });
    status = res.status;
    raw = await res.text();
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
      }
    }
    if (!res.ok) {
      void logger_default.warn(
        `[CBS-NPL] ${url} responded ${res.status}: ${raw?.slice(0, 500) ?? ""}`
      );
    }
    return {
      ok: res.ok,
      status,
      data: parsed,
      requestBody: body,
      rawResponse: raw,
      durationMs: Date.now() - startedAt
    };
  } catch (e) {
    error = e?.name === "AbortError" ? `Request timed out after ${timeoutMs}ms` : String(e?.message ?? e);
    void logger_default.error(`[CBS-NPL] ${url} failed: ${error}`);
    return {
      ok: false,
      status,
      data: void 0,
      requestBody: body,
      rawResponse: raw,
      durationMs: Date.now() - startedAt,
      error
    };
  } finally {
    clearTimeout(timer);
  }
}
function cbsPost(path2, body, opts) {
  return cbsRequest("POST", path2, body, opts);
}
function cbsDelete(path2, opts) {
  return cbsRequest("DELETE", path2, void 0, opts);
}
async function deleteNplAccount(accountNumber) {
  const encoded = encodeURIComponent(String(accountNumber).trim());
  return cbsDelete(`/delete/${encoded}`);
}
async function uploadNplBulk(accountNumbers) {
  const body = { accountNumbers };
  return cbsPost("/bulk", body);
}
async function uploadNplBulkInBatches(accountNumbers) {
  const maxPerRequest = getCbsBulkMaxAccountsPerRequest();
  const chunks = chunkArray(accountNumbers, maxPerRequest);
  const startedAt = Date.now();
  const chunkBodies = chunks.map((c) => ({ accountNumbers: c }));
  if (chunks.length === 0) {
    return {
      ok: true,
      status: 200,
      chunkCount: 0,
      failedChunkIndexes: [],
      data: { totalReceived: 0, insertedCount: 0, alreadyExistsCount: 0 },
      requestBody: { accountNumbers: [], chunks: [] },
      durationMs: 0
    };
  }
  if (chunks.length === 1) {
    const single = await uploadNplBulk(chunks[0]);
    return {
      ok: single.ok,
      status: single.status,
      chunkCount: 1,
      failedChunkIndexes: single.ok ? [] : [0],
      data: single.data,
      requestBody: { accountNumbers, chunks: chunkBodies },
      rawResponse: single.rawResponse,
      durationMs: single.durationMs,
      error: single.error
    };
  }
  console.log(
    `[CBS-NPL] Bulk upload split into ${chunks.length} chunk(s) (max ${maxPerRequest} accounts per request, total ${accountNumbers.length})`
  );
  let totalReceived = 0;
  let insertedCount = 0;
  let alreadyExistsCount = 0;
  const failedChunkIndexes = [];
  const chunkResponses = [];
  let lastStatus = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`[CBS-NPL] Bulk upload chunk ${i + 1}/${chunks.length} (${chunk.length} accounts)`);
    const result = await uploadNplBulk(chunk);
    lastStatus = result.status;
    chunkResponses.push({
      index: i,
      sent: chunk.length,
      ok: result.ok,
      status: result.status,
      data: result.data,
      error: result.error,
      rawResponse: result.rawResponse
    });
    if (result.ok && result.data) {
      totalReceived += result.data.totalReceived ?? 0;
      insertedCount += result.data.insertedCount ?? 0;
      alreadyExistsCount += result.data.alreadyExistsCount ?? 0;
    } else {
      failedChunkIndexes.push(i);
      console.error(`[CBS-NPL] Bulk upload chunk ${i + 1} failed`, {
        status: result.status,
        error: result.error,
        body: result.rawResponse?.slice(0, 300)
      });
    }
  }
  const ok = failedChunkIndexes.length === 0;
  const error = failedChunkIndexes.length > 0 ? `Failed chunk(s): ${failedChunkIndexes.map((i) => i + 1).join(", ")} of ${chunks.length}` : void 0;
  return {
    ok,
    status: ok ? 200 : lastStatus || 400,
    chunkCount: chunks.length,
    failedChunkIndexes,
    data: {
      totalReceived,
      insertedCount,
      alreadyExistsCount
    },
    requestBody: { accountNumbers, chunks: chunkBodies },
    rawResponse: JSON.stringify({ chunks: chunkResponses }),
    durationMs: Date.now() - startedAt,
    error
  };
}
async function requestRepay(payload) {
  return cbsPost("/repay", {
    correlationId: payload.correlationId,
    accountNumber: payload.accountNumber,
    amount: String(payload.amount),
    providerId: payload.providerId
  });
}
var DEFAULT_BASE_URL;
var init_client = __esm({
  "src/lib/cbs-npl/client.ts"() {
    "use strict";
    init_logger();
    DEFAULT_BASE_URL = "http://localhost:8080/api/v1/notification";
  }
});

// src/lib/installment-penalty.ts
function calculateInstallmentPenalty(params) {
  const { dueDate, principalOutstanding, penaltyRules, asOfDate = /* @__PURE__ */ new Date() } = params;
  const principal = Math.max(0, Number(principalOutstanding) || 0);
  if (principal <= 0) return 0;
  const finalDate = startOfDay(asOfDate);
  const instDue = startOfDay(new Date(dueDate));
  if (finalDate <= instDue) return 0;
  const daysOverdue = Math.max(0, differenceInDays(finalDate, instDue));
  if (daysOverdue <= 0) return 0;
  let penaltyComponent = 0;
  for (const rule of penaltyRules || []) {
    const fromDay = rule.fromDay === "" ? 1 : Number(rule.fromDay);
    const toDayRaw = rule.toDay === "" || rule.toDay === null ? Infinity : Number(rule.toDay);
    const toDay = Number.isFinite(toDayRaw) ? toDayRaw : Infinity;
    const value = rule.value === "" ? 0 : Number(rule.value);
    if (!Number.isFinite(fromDay) || fromDay <= 0) continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    if (daysOverdue >= fromDay) {
      const applicableDaysInTier = Math.min(daysOverdue, toDay) - fromDay + 1;
      const isOneTime = rule.frequency === "one-time";
      const daysToCalculate = isOneTime ? 1 : applicableDaysInTier;
      if (daysToCalculate <= 0) continue;
      if (rule.type === "fixed") {
        penaltyComponent += value * daysToCalculate;
      } else if (rule.type === "percentageOfPrincipal") {
        if (principal <= 0) continue;
        penaltyComponent += principal * (value / 100) * daysToCalculate;
      } else if (rule.type === "percentageOfCompound") {
        if (principal <= 0) continue;
        let compoundBase = principal;
        for (let i = 0; i < daysToCalculate; i++) {
          const dailyPenalty = roundCurrency3(compoundBase * (value / 100));
          penaltyComponent += dailyPenalty;
          if (!isOneTime) compoundBase += dailyPenalty;
        }
      }
    }
  }
  return roundCurrency3(penaltyComponent);
}
var roundCurrency3;
var init_installment_penalty = __esm({
  "src/lib/installment-penalty.ts"() {
    "use strict";
    init_date_fns();
    roundCurrency3 = (amount) => {
      return Math.round((amount + Number.EPSILON) * 100) / 100;
    };
  }
});

// src/lib/loan-calculator.ts
var splitInstallmentPaidAmount, calculateTotalRepayable;
var init_loan_calculator = __esm({
  "src/lib/loan-calculator.ts"() {
    "use strict";
    init_date_fns();
    init_interest_accrual();
    init_installment_penalty();
    splitInstallmentPaidAmount = (params) => {
      const { penaltyRules, penaltyDueDate, asOfDate } = params;
      const amount = Math.max(0, Number(params.installmentAmount) || 0);
      const paid = Math.max(0, Number(params.installmentPaidAmount) || 0);
      let principalOutstanding = amount;
      let penalty = 0;
      for (let i = 0; i < 6; i++) {
        penalty = calculateInstallmentPenalty({
          dueDate: penaltyDueDate,
          principalOutstanding,
          penaltyRules,
          asOfDate
        });
        const penaltyPaid2 = Math.min(paid, penalty);
        const principalPaid2 = Math.min(amount, Math.max(0, paid - penaltyPaid2));
        const nextOutstanding = Math.max(0, amount - principalPaid2);
        if (nextOutstanding === principalOutstanding) break;
        principalOutstanding = nextOutstanding;
      }
      penalty = calculateInstallmentPenalty({
        dueDate: penaltyDueDate,
        principalOutstanding,
        penaltyRules,
        asOfDate
      });
      const penaltyPaid = Math.min(paid, penalty);
      const principalPaid = Math.min(amount, Math.max(0, paid - penaltyPaid));
      return {
        penaltyAccrued: roundCurrency2(penalty),
        penaltyPaid: roundCurrency2(penaltyPaid),
        penaltyRemaining: roundCurrency2(Math.max(0, penalty - penaltyPaid)),
        principalPaid: roundCurrency2(principalPaid),
        principalRemaining: roundCurrency2(Math.max(0, amount - principalPaid))
      };
    };
    calculateTotalRepayable = (loanDetails, loanProduct, taxConfigs, asOfDate = /* @__PURE__ */ new Date(), forceCalculate = false) => {
      const loanStartDate = startOfDay(new Date(loanDetails.disbursedDate));
      const finalDate = startOfDay(asOfDate);
      const dueDate = startOfDay(new Date(loanDetails.dueDate));
      const principal = loanDetails.loanAmount;
      let serviceFee = 0;
      let interestComponent = 0;
      let penaltyComponent = 0;
      let taxComponent = 0;
      const safeParse = (field, defaultValue) => {
        if (typeof field === "string") {
          try {
            return JSON.parse(field);
          } catch (e) {
            return defaultValue;
          }
        }
        return field ?? defaultValue;
      };
      const serviceFeeRule = safeParse(loanProduct.serviceFee, void 0);
      const dailyFeeRule = safeParse(loanProduct.dailyFee, void 0);
      const penaltyRules = safeParse(loanProduct.penaltyRules, []);
      if (loanProduct.serviceFeeEnabled && serviceFeeRule && serviceFeeRule.value > 0) {
        const feeValue = typeof serviceFeeRule.value === "string" ? parseFloat(serviceFeeRule.value) : serviceFeeRule.value;
        if (serviceFeeRule.type === "fixed") {
          serviceFee = feeValue;
        } else if (serviceFeeRule.type === "percentage") {
          serviceFee = principal * (feeValue / 100);
        }
      }
      serviceFee = roundCurrency2(serviceFee);
      if (loanProduct.dailyFeeEnabled && dailyFeeRule && dailyFeeRule.value > 0) {
        const feeValue = typeof dailyFeeRule.value === "string" ? parseFloat(dailyFeeRule.value) : dailyFeeRule.value;
        const interestEndDate = finalDate > dueDate ? dueDate : finalDate;
        const payments = normalizePayments(loanDetails.payments);
        interestComponent = calculateInterestWithPayments({
          principal,
          loanStartDate,
          interestEndDate,
          dailyFeeRule: {
            type: dailyFeeRule.type,
            value: feeValue,
            calculationBase: dailyFeeRule.calculationBase
          },
          serviceFee,
          payments
        });
      }
      interestComponent = roundCurrency2(interestComponent);
      const runningBalanceForPenalty = principal + interestComponent + serviceFee;
      if (loanDetails.repaymentStatus === "Paid" && !forceCalculate) {
        penaltyComponent = 0;
      } else if (loanProduct.penaltyRulesEnabled && penaltyRules && penaltyRules.length > 0) {
        if (loanProduct.penaltyPerInstallment && Array.isArray(loanDetails.installments) && loanDetails.installments.length > 0) {
          for (const inst of loanDetails.installments) {
            const instDue = startOfDay(new Date(inst.dueDate));
            if (finalDate <= instDue) continue;
            const split = splitInstallmentPaidAmount({
              installmentAmount: inst.amount || 0,
              installmentPaidAmount: inst.paidAmount || 0,
              penaltyRules,
              penaltyDueDate: instDue,
              asOfDate: finalDate
            });
            penaltyComponent += split.penaltyAccrued;
          }
        } else {
          if (finalDate > dueDate) {
            const penaltyStartDate = loanProduct.duration === 0 ? startOfDay(
              new Date(loanDetails.disbursedDate.getTime() + 864e5)
            ) : dueDate;
            const daysOverdueTotal = differenceInDays(finalDate, penaltyStartDate);
            penaltyRules.forEach((rule) => {
              const fromDay = rule.fromDay === "" ? 1 : Number(rule.fromDay);
              const toDayRaw = rule.toDay === "" || rule.toDay === null ? Infinity : Number(rule.toDay);
              const toDay = isNaN(toDayRaw) ? Infinity : toDayRaw;
              const value = rule.value === "" ? 0 : Number(rule.value);
              if (daysOverdueTotal >= fromDay) {
                const applicableDaysInTier = Math.min(daysOverdueTotal, toDay) - fromDay + 1;
                const isOneTime = rule.frequency === "one-time";
                if (applicableDaysInTier > 0) {
                  let penaltyForThisRule = 0;
                  const daysToCalculate = isOneTime ? 1 : applicableDaysInTier;
                  if (rule.type === "fixed") {
                    penaltyForThisRule = value * daysToCalculate;
                  } else if (rule.type === "percentageOfPrincipal") {
                    penaltyForThisRule = principal * (value / 100) * daysToCalculate;
                  } else if (rule.type === "percentageOfCompound") {
                    let compoundPenaltyBase = runningBalanceForPenalty + penaltyComponent;
                    for (let i = 0; i < daysToCalculate; i++) {
                      const dailyPenalty = roundCurrency2(
                        compoundPenaltyBase * (value / 100)
                      );
                      penaltyForThisRule += dailyPenalty;
                      if (!isOneTime) {
                        compoundPenaltyBase += dailyPenalty;
                      }
                    }
                  }
                  penaltyComponent += penaltyForThisRule;
                }
              }
            });
          }
        }
      }
      penaltyComponent = roundCurrency2(penaltyComponent);
      taxConfigs.forEach((taxConfig) => {
        const taxRate = taxConfig.rate;
        const taxAppliedTo = JSON.parse(taxConfig.appliedTo);
        if (taxRate > 0) {
          let taxableAmount = 0;
          if (taxAppliedTo.includes("serviceFee")) {
            taxableAmount += serviceFee;
          }
          if (taxAppliedTo.includes("interest")) {
            taxableAmount += interestComponent;
          }
          if (taxAppliedTo.includes("penalty")) {
            taxableAmount += penaltyComponent;
          }
          taxComponent += taxableAmount * (taxRate / 100);
        }
      });
      taxComponent = roundCurrency2(taxComponent);
      const totalDebt = roundCurrency2(
        principal + serviceFee + interestComponent + penaltyComponent + taxComponent
      );
      return {
        total: totalDebt,
        principal,
        serviceFee,
        interest: interestComponent,
        penalty: penaltyComponent,
        tax: taxComponent
      };
    };
  }
});

// src/actions/cbs-npl.ts
var cbs_npl_exports = {};
__export(cbs_npl_exports, {
  attemptRepayForNotification: () => attemptRepayForNotification,
  computeStaleCbsAccounts: () => computeStaleCbsAccounts,
  deleteNplAccountFromCbs: () => deleteNplAccountFromCbs,
  processCreditNotification: () => processCreditNotification,
  syncCbsDeletionForBorrower: () => syncCbsDeletionForBorrower,
  uploadNplListToCbs: () => uploadNplListToCbs
});
async function uploadNplListToCbs(opts) {
  const source = opts?.source ?? (opts?.triggeredByUserId ? "MANUAL" : "SCHEDULED");
  const accountNumbers = await collectActiveNplAccountNumbers();
  const batch = await prisma_default.nplCbsUploadBatch.create({
    data: {
      triggeredByUserId: opts?.triggeredByUserId ?? null,
      source,
      status: "PENDING",
      accountsSentCount: accountNumbers.length,
      accountNumbers: JSON.stringify(accountNumbers)
    }
  });
  if (accountNumbers.length === 0) {
    const finished2 = await prisma_default.nplCbsUploadBatch.update({
      where: { id: batch.id },
      data: {
        status: "SUCCESS",
        totalReceived: 0,
        insertedCount: 0,
        alreadyExistsCount: 0,
        finishedAt: /* @__PURE__ */ new Date(),
        responsePayload: JSON.stringify({ skipped: true, reason: "no NPL accounts" })
      }
    });
    void logger_default.info(`[CBS-NPL] Upload skipped (no NPL accounts) batch=${batch.id}`);
    return {
      success: true,
      batchId: finished2.id,
      accountsSentCount: 0,
      totalReceived: 0,
      insertedCount: 0,
      alreadyExistsCount: 0,
      message: "No NPL accounts to upload."
    };
  }
  const result = await uploadNplBulkInBatches(accountNumbers);
  const finished = await prisma_default.nplCbsUploadBatch.update({
    where: { id: batch.id },
    data: {
      status: result.ok ? "SUCCESS" : "FAILED",
      httpStatus: result.status || null,
      totalReceived: result.data?.totalReceived ?? null,
      insertedCount: result.data?.insertedCount ?? null,
      alreadyExistsCount: result.data?.alreadyExistsCount ?? null,
      errorMessage: result.error ?? (!result.ok ? truncate(result.rawResponse, 2e3) ?? null : null),
      requestPayload: toJsonString(result.requestBody),
      responsePayload: result.rawResponse ?? null,
      finishedAt: /* @__PURE__ */ new Date()
    }
  });
  await createAuditLog({
    actorId: opts?.triggeredByUserId ?? "system",
    action: result.ok ? "CBS_NPL_BULK_UPLOAD_SUCCESS" : "CBS_NPL_BULK_UPLOAD_FAILED",
    entity: "NplCbsUploadBatch",
    entityId: finished.id,
    details: {
      accountsSentCount: accountNumbers.length,
      chunkCount: result.chunkCount,
      failedChunkIndexes: result.failedChunkIndexes,
      totalReceived: finished.totalReceived,
      insertedCount: finished.insertedCount,
      alreadyExistsCount: finished.alreadyExistsCount,
      httpStatus: finished.httpStatus,
      durationMs: result.durationMs,
      error: finished.errorMessage
    }
  });
  const chunkNote = result.chunkCount > 1 ? ` in ${result.chunkCount} CBS request(s)` : "";
  return {
    success: result.ok,
    batchId: finished.id,
    accountsSentCount: accountNumbers.length,
    totalReceived: finished.totalReceived ?? void 0,
    insertedCount: finished.insertedCount ?? void 0,
    alreadyExistsCount: finished.alreadyExistsCount ?? void 0,
    message: result.ok ? `Uploaded ${accountNumbers.length} account(s) to CBS${chunkNote}.` : finished.errorMessage || "CBS upload failed."
  };
}
async function collectActiveNplAccountNumbers() {
  const nplLoans = await prisma_default.loan.findMany({
    where: {
      repaymentStatus: "Unpaid",
      borrower: { status: "NPL" }
    },
    select: { borrowerId: true }
  });
  if (nplLoans.length === 0) return [];
  const CHUNK_SIZE = 1e3;
  const borrowerIds = Array.from(new Set(nplLoans.map((l) => l.borrowerId)));
  const accountByBorrower = /* @__PURE__ */ new Map();
  for (let i = 0; i < borrowerIds.length; i += CHUNK_SIZE) {
    const chunk = borrowerIds.slice(i, i + CHUNK_SIZE);
    const phoneAccounts = await prisma_default.phoneAccount.findMany({
      where: { phoneNumber: { in: chunk } },
      select: { phoneNumber: true, accountNumber: true, isActive: true }
    });
    for (const pa of phoneAccounts) {
      const existing = accountByBorrower.get(pa.phoneNumber);
      if (!existing || pa.isActive && existing !== pa.accountNumber) {
        accountByBorrower.set(pa.phoneNumber, pa.accountNumber);
      }
    }
  }
  const missingIds = borrowerIds.filter((id) => !accountByBorrower.has(id));
  for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
    const chunk = missingIds.slice(i, i + CHUNK_SIZE);
    const pdRows = await prisma_default.provisionedData.findMany({
      where: { borrowerId: { in: chunk } },
      orderBy: { createdAt: "desc" },
      select: { borrowerId: true, data: true }
    });
    for (const row of pdRows) {
      if (accountByBorrower.has(row.borrowerId)) continue;
      const account = accountNumberFromProvisionedData(row.data);
      if (account) accountByBorrower.set(row.borrowerId, account);
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const borrowerId of borrowerIds) {
    const account = accountByBorrower.get(borrowerId);
    if (account && !seen.has(account)) {
      seen.add(account);
      out.push(account);
    }
  }
  return out;
}
function accountNumberFromProvisionedData(raw) {
  if (!raw) return null;
  try {
    const pd = JSON.parse(raw);
    const candidate = pd.AccountNumber ?? pd.accountNumber ?? pd.account_number ?? pd.accountNo ?? pd.account_no ?? null;
    return candidate ? String(candidate) : null;
  } catch {
    return null;
  }
}
async function resolveAccountNumbersForBorrower(borrowerId) {
  const accounts = /* @__PURE__ */ new Set();
  const phoneAccounts = await prisma_default.phoneAccount.findMany({
    where: { phoneNumber: borrowerId },
    select: { accountNumber: true }
  });
  for (const pa of phoneAccounts) {
    if (pa.accountNumber) accounts.add(String(pa.accountNumber));
  }
  if (accounts.size === 0) {
    const pd = await prisma_default.provisionedData.findFirst({
      where: { borrowerId },
      orderBy: { createdAt: "desc" },
      select: { data: true }
    });
    const fromPd = accountNumberFromProvisionedData(pd?.data);
    if (fromPd) accounts.add(fromPd);
  }
  return Array.from(accounts);
}
async function deleteNplAccountFromCbs(args) {
  const accountNumber = String(args.accountNumber).trim();
  const call = await deleteNplAccount(accountNumber);
  const notFound = call.status === 404 || Boolean(call.data?.message?.toLowerCase().includes("not found"));
  const ok = call.ok || notFound;
  const record = await prisma_default.nplCbsDeletion.create({
    data: {
      accountNumber,
      source: args.source,
      status: ok ? "SUCCESS" : "FAILED",
      httpStatus: call.status || null,
      reason: args.reason ?? null,
      borrowerId: args.borrowerId ?? null,
      triggeredByUserId: args.triggeredByUserId ?? null,
      responsePayload: call.rawResponse ?? null,
      errorMessage: ok ? null : call.error ?? truncate(call.rawResponse, 2e3) ?? null,
      finishedAt: /* @__PURE__ */ new Date()
    }
  });
  await createAuditLog({
    actorId: args.triggeredByUserId ?? (args.source === "AUTO" ? "cbs-auto" : "system"),
    action: ok ? "CBS_NPL_DELETE_SUCCESS" : "CBS_NPL_DELETE_FAILED",
    entity: "NplCbsDeletion",
    entityId: record.id,
    details: {
      accountNumber,
      source: args.source,
      httpStatus: call.status,
      borrowerId: args.borrowerId ?? null,
      message: call.data?.message ?? call.error ?? null
    }
  });
  return {
    id: record.id,
    accountNumber,
    status: ok ? "SUCCESS" : "FAILED",
    httpStatus: call.status || null,
    message: call.data?.message ?? call.error ?? null
  };
}
async function syncCbsDeletionForBorrower(borrowerId, opts) {
  try {
    if (!borrowerId) return;
    const remainingUnpaid = await prisma_default.loan.count({
      where: { borrowerId, repaymentStatus: "Unpaid" }
    });
    if (remainingUnpaid > 0) return;
    const accounts = await resolveAccountNumbersForBorrower(borrowerId);
    if (accounts.length === 0) return;
    const latestUpload = await prisma_default.nplCbsUploadBatch.aggregate({
      _max: { startedAt: true }
    });
    const latestUploadAt = latestUpload._max.startedAt;
    for (const accountNumber of accounts) {
      const priorSuccess = await prisma_default.nplCbsDeletion.findFirst({
        where: { accountNumber, status: "SUCCESS" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
      });
      if (priorSuccess && (!latestUploadAt || priorSuccess.createdAt >= latestUploadAt)) {
        continue;
      }
      await deleteNplAccountFromCbs({
        accountNumber,
        source: opts?.source ?? "AUTO",
        reason: opts?.reason ?? "Borrower exited NPL (loan fully repaid).",
        borrowerId,
        triggeredByUserId: opts?.actorId ?? null
      });
    }
  } catch (e) {
    void logger_default.error(
      `[CBS-NPL] syncCbsDeletionForBorrower failed for borrower=${borrowerId}: ${String(e?.message ?? e)}`
    );
  }
}
async function computeStaleCbsAccounts() {
  const batches = await prisma_default.nplCbsUploadBatch.findMany({
    where: { status: "SUCCESS" },
    select: { accountNumbers: true }
  });
  const uploaded = /* @__PURE__ */ new Set();
  for (const b of batches) {
    try {
      const arr = JSON.parse(b.accountNumbers);
      if (Array.isArray(arr)) {
        for (const a of arr) if (a) uploaded.add(String(a));
      }
    } catch {
    }
  }
  if (uploaded.size === 0) return [];
  const [current, deletedRows] = await Promise.all([
    collectActiveNplAccountNumbers(),
    prisma_default.nplCbsDeletion.findMany({
      where: { status: "SUCCESS" },
      select: { accountNumber: true }
    })
  ]);
  const currentSet = new Set(current);
  const deletedSet = new Set(deletedRows.map((d) => d.accountNumber));
  const stale = [];
  for (const account of uploaded) {
    if (!currentSet.has(account) && !deletedSet.has(account)) stale.push(account);
  }
  return stale.sort();
}
async function processCreditNotification(payload, opts) {
  const accountNumber = String(payload.accountNumber ?? "").trim();
  const creditedAmount = Number(payload.amount);
  const externalReference = payload.externalReference ? String(payload.externalReference) : null;
  console.log("[CBS-NPL][Process] Start", {
    accountNumber,
    creditedAmount,
    externalReference,
    correlationId: payload?.correlationId ?? null,
    providerId: payload.providerId ?? null,
    sourceIp: opts?.sourceIp ?? null
  });
  if (!accountNumber || !Number.isFinite(creditedAmount) || creditedAmount < 0) {
    const created = await prisma_default.nplCreditNotification.create({
      data: {
        correlationId: (0, import_crypto2.randomUUID)(),
        externalReference,
        accountNumber: accountNumber || "(missing)",
        creditedAmount: Number.isFinite(creditedAmount) ? creditedAmount : 0,
        providerId: payload.providerId ?? null,
        rawPayload: JSON.stringify(payload),
        processStatus: "FAILED",
        resultMessage: "Invalid payload: accountNumber and positive amount are required.",
        attempts: 1,
        lastAttemptAt: /* @__PURE__ */ new Date()
      }
    });
    return {
      notificationId: created.id,
      status: created.processStatus,
      message: created.resultMessage ?? "Invalid payload."
    };
  }
  if (externalReference) {
    const existing = await prisma_default.nplCreditNotification.findUnique({
      where: { externalReference }
    });
    if (existing) {
      console.log("[CBS-NPL][Process] Duplicate externalReference detected", {
        notificationId: existing.id,
        externalReference,
        existingStatus: existing.processStatus
      });
      if (!REPAY_TRIGGERING_STATUSES.has(existing.processStatus)) {
        return {
          notificationId: existing.id,
          status: "DUPLICATE",
          message: `Notification already processed (status=${existing.processStatus}).`
        };
      }
      return await attemptRepayForNotification(existing.id, opts?.actorId);
    }
  }
  const correlationId = (0, import_crypto2.randomUUID)();
  const notification = await prisma_default.nplCreditNotification.create({
    data: {
      correlationId,
      externalReference,
      accountNumber,
      creditedAmount,
      providerId: payload.providerId ?? null,
      rawPayload: JSON.stringify(payload),
      processStatus: "PENDING"
    }
  });
  console.log("[CBS-NPL][Process] Notification persisted", {
    notificationId: notification.id,
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    creditedAmount: notification.creditedAmount
  });
  return await attemptRepayForNotification(notification.id, opts?.actorId);
}
async function attemptRepayForNotification(notificationId, actorId) {
  console.log("[CBS-NPL][Repay] Attempt start", { notificationId, actorId: actorId ?? "cbs-webhook" });
  const notification = await prisma_default.nplCreditNotification.findUnique({
    where: { id: notificationId }
  });
  if (!notification) {
    return {
      notificationId,
      status: "FAILED",
      message: "Notification not found."
    };
  }
  if (!REPAY_TRIGGERING_STATUSES.has(notification.processStatus)) {
    console.log("[CBS-NPL][Repay] Skipped terminal status", {
      notificationId: notification.id,
      status: notification.processStatus
    });
    return {
      notificationId,
      status: notification.processStatus,
      message: `Notification in terminal status ${notification.processStatus}; nothing to do.`
    };
  }
  const match2 = await locateLoanByAccountNumber(notification.accountNumber);
  if (!match2) {
    console.log("[CBS-NPL][Repay] No matching unpaid loan found", {
      notificationId: notification.id,
      accountNumber: notification.accountNumber
    });
    const updated2 = await prisma_default.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "UNMATCHED_ACCOUNT",
        resultMessage: "No unpaid NPL loan found for the supplied account number.",
        attempts: { increment: 1 },
        lastAttemptAt: /* @__PURE__ */ new Date()
      }
    });
    await createAuditLog({
      actorId: actorId ?? "cbs-webhook",
      action: "CBS_CREDIT_NOTIFICATION_UNMATCHED",
      entity: "NplCreditNotification",
      entityId: updated2.id,
      details: { accountNumber: notification.accountNumber }
    });
    return {
      notificationId: updated2.id,
      status: updated2.processStatus,
      message: updated2.resultMessage ?? "Unmatched account."
    };
  }
  const { loan, totalOutstanding, borrowerId } = match2;
  console.log("[CBS-NPL][Repay] Loan matched", {
    notificationId: notification.id,
    borrowerId,
    loanId: loan.id,
    totalOutstanding,
    creditedAmount: notification.creditedAmount
  });
  if (totalOutstanding <= 0.01) {
    const updated2 = await prisma_default.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "NO_OUTSTANDING",
        borrowerId,
        loanId: loan.id,
        resultMessage: "Matched loan has no outstanding balance; nothing to collect.",
        attempts: { increment: 1 },
        lastAttemptAt: /* @__PURE__ */ new Date()
      }
    });
    return {
      notificationId: updated2.id,
      status: updated2.processStatus,
      message: updated2.resultMessage ?? "Loan is already fully paid."
    };
  }
  let currentBalance = 0;
  let accountMinimumBalance = 0;
  try {
    const raw = JSON.parse(notification.rawPayload || "{}");
    currentBalance = Number(raw.currentBalance);
    accountMinimumBalance = Number(raw.accountMinimumBalance);
  } catch {
  }
  if (!Number.isFinite(currentBalance)) currentBalance = 0;
  if (!Number.isFinite(accountMinimumBalance)) accountMinimumBalance = 0;
  const availableBalance = Number((currentBalance - accountMinimumBalance).toFixed(2));
  const amountToCollect = Math.min(
    Number(totalOutstanding.toFixed(2)),
    availableBalance
  );
  console.log("[CBS-NPL][Repay] Balance-based collection", {
    notificationId: notification.id,
    totalOutstanding: Number(totalOutstanding.toFixed(2)),
    currentBalance,
    accountMinimumBalance,
    availableBalance,
    amountToCollect
  });
  if (amountToCollect <= 0.01) {
    const updated2 = await prisma_default.nplCreditNotification.update({
      where: { id: notification.id },
      data: {
        processStatus: "FAILED",
        borrowerId,
        loanId: loan.id,
        resultMessage: `Insufficient available balance to collect (currentBalance=${currentBalance}, accountMinimumBalance=${accountMinimumBalance}, available=${availableBalance}).`,
        attempts: { increment: 1 },
        lastAttemptAt: /* @__PURE__ */ new Date()
      }
    });
    console.log("[CBS-NPL][Repay] Skipped \u2014 no available balance", {
      notificationId: notification.id,
      availableBalance
    });
    return {
      notificationId: updated2.id,
      status: updated2.processStatus,
      message: updated2.resultMessage ?? "Insufficient available balance."
    };
  }
  console.log("[CBS-NPL][Repay] Calling CBS /repay", {
    notificationId: notification.id,
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    amountToCollect
  });
  const cbsProviderId = notification.providerId?.trim() || getDefaultCbsProviderId();
  const repayCall = await requestRepay({
    correlationId: notification.correlationId,
    accountNumber: notification.accountNumber,
    amount: amountToCollect,
    providerId: cbsProviderId
  });
  const repayData = repayCall.data;
  const repaySuccess = repayCall.ok && repayData?.status === "Success" && repayData?.status_code === 200;
  console.log("[CBS-NPL][Repay] CBS /repay response", {
    notificationId: notification.id,
    ok: repayCall.ok,
    httpStatus: repayCall.status,
    status: repayData?.status ?? null,
    statusCode: repayData?.status_code ?? null,
    transactionId: repayData?.transactionId ?? null,
    message: repayData?.message ?? repayCall.error ?? null
  });
  let paymentId = null;
  let breakdown = null;
  let internalError = null;
  if (repaySuccess) {
    try {
      console.log("[CBS-NPL][AutoDebit] Internal posting start", {
        notificationId: notification.id,
        loanId: loan.id,
        amount: amountToCollect
      });
      breakdown = await recordCbsRepayment({
        loanId: loan.id,
        amount: amountToCollect,
        correlationId: notification.correlationId,
        cbsTransactionId: repayData?.transactionId ?? null
      });
      paymentId = breakdown.paymentId;
      console.log("[CBS-NPL][AutoDebit] Internal posting success", {
        notificationId: notification.id,
        paymentId
      });
    } catch (e) {
      internalError = e?.message ?? String(e);
      console.error("[CBS-NPL][AutoDebit] Internal posting failed", {
        notificationId: notification.id,
        loanId: loan.id,
        error: internalError
      });
      void logger_default.error(
        `[CBS-NPL] Internal repayment posting failed for notification=${notification.id}: ${internalError}`
      );
    }
  }
  const finalStatus = repaySuccess ? internalError ? "FAILED" : amountToCollect < Number(totalOutstanding.toFixed(2)) - 0.01 ? "PARTIAL_REPAID" : "REPAID" : repayData?.message?.toLowerCase().includes("duplicate") ? "DUPLICATE" : "FAILED";
  const updated = await prisma_default.nplCreditNotification.update({
    where: { id: notification.id },
    data: {
      borrowerId,
      loanId: loan.id,
      paymentId: paymentId ?? null,
      processStatus: finalStatus,
      resultMessage: internalError ? `CBS debited but internal posting failed: ${internalError}` : repayData?.message ?? repayCall.error ?? null,
      repayHttpStatus: repayCall.status || null,
      repayTransactionId: repayData?.transactionId ?? null,
      repayDebitAmount: repayData?.debitAmount ?? amountToCollect,
      repayDebitAccount: repayData?.debitAccount ?? notification.accountNumber,
      repayCreditAccount: repayData?.creditAccount ?? null,
      repayResponse: repayCall.rawResponse ?? null,
      attempts: { increment: 1 },
      lastAttemptAt: /* @__PURE__ */ new Date()
    }
  });
  console.log("[CBS-NPL][Repay] Notification updated", {
    notificationId: updated.id,
    finalStatus: updated.processStatus,
    paymentId: updated.paymentId ?? null,
    repayTransactionId: updated.repayTransactionId ?? null
  });
  await createAuditLog({
    actorId: actorId ?? "cbs-webhook",
    action: repaySuccess ? internalError ? "CBS_REPAY_INTERNAL_POSTING_FAILED" : "CBS_REPAY_SUCCESS" : "CBS_REPAY_FAILED",
    entity: "NplCreditNotification",
    entityId: updated.id,
    details: {
      loanId: loan.id,
      borrowerId,
      requestedAmount: amountToCollect,
      creditedAmount: notification.creditedAmount,
      cbsStatus: repayCall.status,
      cbsTransactionId: repayData?.transactionId,
      cbsMessage: repayData?.message,
      durationMs: repayCall.durationMs
    }
  });
  if (repaySuccess && !internalError && breakdown) {
    void notifyRepaymentBySms({
      phone: borrowerId,
      accountNumber: notification.accountNumber,
      breakdown,
      notificationId: notification.id
    });
  }
  if (repaySuccess && !internalError && breakdown?.isFullyPaid) {
    void syncCbsDeletionForBorrower(borrowerId, {
      source: "AUTO",
      reason: "NPL loan fully repaid via CBS auto-debit."
    });
  }
  return {
    notificationId: updated.id,
    status: updated.processStatus,
    message: updated.resultMessage ?? (repaySuccess ? "Repayment collected." : "Repayment failed."),
    repayResponse: repayData ?? null
  };
}
async function notifyRepaymentBySms(args) {
  const { phone, accountNumber, breakdown, notificationId } = args;
  const money = (n) => Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const maskAccount = (acct) => {
    const digits = String(acct ?? "").replace(/\s/g, "");
    return digits.length <= 4 ? digits : `**${digits.slice(-4)}`;
  };
  const lines = [
    `Dear customer, a loan repayment of Birr ${money(breakdown.paymentAmount)} was deducted from account ${maskAccount(accountNumber)}. for Nibtera Loan repayment.`,
    `Penalty: Birr ${money(breakdown.applied.penalty)}`,
    `Service Fee: Birr ${money(breakdown.applied.serviceFee)}`,
    `Principal: Birr ${money(breakdown.applied.principal)}`
  ];
  if (breakdown.applied.interest > 0) {
    lines.push(`Interest: Birr ${money(breakdown.applied.interest)}`);
  }
  if (breakdown.applied.tax > 0) {
    lines.push(`Tax: Birr ${money(breakdown.applied.tax)}`);
  }
  lines.push(
    breakdown.isFullyPaid ? "Your loan is now fully paid. for further info call 9698" : `Outstanding balance: Birr ${money(breakdown.remainingBalance)}.for further info call 9698`
  );
  try {
    const res = await sms_default(String(phone), lines.join("\n"));
    console.log("[CBS-NPL][AutoDebit] Repayment SMS", {
      notificationId,
      to: phone,
      ok: res.ok,
      error: res.ok ? void 0 : res.error
    });
    if (!res.ok) {
      void logger_default.warn(
        `[CBS-NPL] Repayment SMS to ${phone} failed for notification=${notificationId}: ${res.error ?? "unknown"}`
      );
    }
  } catch (e) {
    const error = e?.message ?? String(e);
    console.error("[CBS-NPL][AutoDebit] Repayment SMS threw", {
      notificationId,
      to: phone,
      error
    });
    void logger_default.error(
      `[CBS-NPL] Repayment SMS to ${phone} threw for notification=${notificationId}: ${error}`
    );
  }
}
async function locateLoanByAccountNumber(accountNumber) {
  const phoneAccounts = await prisma_default.phoneAccount.findMany({
    where: { accountNumber },
    select: { phoneNumber: true, isActive: true }
  });
  if (phoneAccounts.length === 0) return null;
  const ordered = [...phoneAccounts].sort((a, b) => Number(b.isActive) - Number(a.isActive));
  const borrowerIds = Array.from(new Set(ordered.map((p) => p.phoneNumber)));
  const today = startOfDay(/* @__PURE__ */ new Date());
  const taxConfigs = await prisma_default.tax.findMany({ where: { status: "ACTIVE" } });
  const loans = await prisma_default.loan.findMany({
    where: {
      borrowerId: { in: borrowerIds },
      repaymentStatus: "Unpaid"
    },
    include: {
      product: true,
      payments: { orderBy: { date: "asc" } },
      installments: true
    },
    orderBy: { dueDate: "asc" }
  });
  for (const loan of loans) {
    const totals = calculateTotalRepayable(
      loan,
      loan.product,
      taxConfigs,
      today,
      true
    );
    const repaid = loan.repaidAmount || 0;
    const outstanding = Math.max(0, totals.total - repaid);
    if (outstanding > 0.01) {
      return {
        loan,
        totalOutstanding: outstanding,
        borrowerId: loan.borrowerId
      };
    }
  }
  return null;
}
async function recordCbsRepayment(args) {
  const { loanId, amount, correlationId, cbsTransactionId } = args;
  console.log("[CBS-NPL][AutoDebit] Preparing ledger posting", {
    loanId,
    amount,
    correlationId,
    cbsTransactionId
  });
  const [loan, taxConfigs] = await Promise.all([
    prisma_default.loan.findUnique({
      where: { id: loanId },
      include: {
        product: { include: { provider: { include: { ledgerAccounts: true } } } },
        payments: { orderBy: { date: "asc" } }
      }
    }),
    prisma_default.tax.findMany({ where: { status: "ACTIVE" } })
  ]);
  if (!loan) throw new Error(`Loan ${loanId} not found`);
  const provider = loan.product.provider;
  const today = startOfDay(/* @__PURE__ */ new Date());
  const totals = calculateTotalRepayable(
    loan,
    loan.product,
    taxConfigs,
    today,
    true
  );
  const alreadyRepaid = loan.repaidAmount || 0;
  const totalDue = Math.max(0, totals.total - alreadyRepaid);
  const alreadyPaidPenalty = Math.min(totals.penalty, alreadyRepaid);
  const alreadyPaidServiceFee = Math.min(totals.serviceFee, Math.max(0, alreadyRepaid - totals.penalty));
  const alreadyPaidInterest = Math.min(
    totals.interest,
    Math.max(0, alreadyRepaid - totals.penalty - totals.serviceFee)
  );
  const alreadyPaidTax = Math.min(
    totals.tax,
    Math.max(0, alreadyRepaid - totals.penalty - totals.serviceFee - totals.interest)
  );
  const alreadyPaidPrincipal = Math.min(
    totals.principal,
    Math.max(
      0,
      alreadyRepaid - totals.penalty - totals.serviceFee - totals.interest - totals.tax
    )
  );
  const penaltyDue = Math.max(0, totals.penalty - alreadyPaidPenalty);
  const serviceFeeDue = Math.max(0, totals.serviceFee - alreadyPaidServiceFee);
  const interestDue = Math.max(0, totals.interest - alreadyPaidInterest);
  const taxDue = Math.max(0, totals.tax - alreadyPaidTax);
  const principalDue = Math.max(0, totals.principal - alreadyPaidPrincipal);
  const paymentAmount = Math.min(amount, totalDue);
  if (paymentAmount <= 0) {
    throw new Error("Nothing left to collect for this loan.");
  }
  const principalReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Principal" && a.type === "Receivable"
  );
  const interestReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Receivable"
  );
  const penaltyReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Receivable"
  );
  const serviceFeeReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Receivable"
  );
  const taxReceivable = provider.ledgerAccounts.find(
    (a) => a.category === "Tax" && a.type === "Receivable"
  );
  const principalReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Principal" && a.type === "Received"
  );
  const interestReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Received"
  );
  const penaltyReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Received"
  );
  const serviceFeeReceived = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Received"
  );
  const taxReceived = provider.ledgerAccounts.find(
    (a) => a.category === "Tax" && a.type === "Received"
  );
  const interestIncome = provider.ledgerAccounts.find(
    (a) => a.category === "Interest" && a.type === "Income"
  );
  const penaltyIncome = provider.ledgerAccounts.find(
    (a) => a.category === "Penalty" && a.type === "Income"
  );
  const serviceFeeIncome = provider.ledgerAccounts.find(
    (a) => a.category === "ServiceFee" && a.type === "Income"
  );
  if (!principalReceivable || !interestReceivable || !penaltyReceivable || !serviceFeeReceivable || !taxReceivable || !principalReceived || !interestReceived || !penaltyReceived || !serviceFeeReceived || !taxReceived) {
    throw new Error(`Ledger accounts not configured for provider ${provider.id}`);
  }
  const paymentRecord = await prisma_default.$transaction(async (tx) => {
    let amountToApply = paymentAmount;
    const journalEntry = await tx.journalEntry.create({
      data: {
        providerId: provider.id,
        loanId: loan.id,
        date: today,
        description: `CBS NPL collection for loan ${loan.id} (correlationId=${correlationId}${cbsTransactionId ? ` cbsTxn=${cbsTransactionId}` : ""})`
      }
    });
    const ledgerEntries = [];
    const penaltyToPay = Math.min(amountToApply, penaltyDue);
    if (penaltyToPay > 0) {
      if (!penaltyIncome) throw new Error("Penalty Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: penaltyReceivable.id }, data: { balance: { decrement: penaltyToPay } } });
      await tx.ledgerAccount.update({ where: { id: penaltyReceived.id }, data: { balance: { increment: penaltyToPay } } });
      await tx.ledgerAccount.update({ where: { id: penaltyIncome.id }, data: { balance: { increment: penaltyToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: penaltyReceivable.id, type: "Credit", amount: penaltyToPay },
        { ledgerAccountId: penaltyReceived.id, type: "Debit", amount: penaltyToPay },
        { ledgerAccountId: penaltyIncome.id, type: "Credit", amount: penaltyToPay }
      );
      amountToApply -= penaltyToPay;
    }
    const serviceFeeToPay = Math.min(amountToApply, serviceFeeDue);
    if (serviceFeeToPay > 0) {
      if (!serviceFeeIncome) throw new Error("Service Fee Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: serviceFeeReceivable.id }, data: { balance: { decrement: serviceFeeToPay } } });
      await tx.ledgerAccount.update({ where: { id: serviceFeeReceived.id }, data: { balance: { increment: serviceFeeToPay } } });
      await tx.ledgerAccount.update({ where: { id: serviceFeeIncome.id }, data: { balance: { increment: serviceFeeToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: serviceFeeReceivable.id, type: "Credit", amount: serviceFeeToPay },
        { ledgerAccountId: serviceFeeReceived.id, type: "Debit", amount: serviceFeeToPay },
        { ledgerAccountId: serviceFeeIncome.id, type: "Credit", amount: serviceFeeToPay }
      );
      amountToApply -= serviceFeeToPay;
    }
    const interestToPay = Math.min(amountToApply, interestDue);
    if (interestToPay > 0) {
      if (!interestIncome) throw new Error("Interest Income ledger account missing");
      await tx.ledgerAccount.update({ where: { id: interestReceivable.id }, data: { balance: { decrement: interestToPay } } });
      await tx.ledgerAccount.update({ where: { id: interestReceived.id }, data: { balance: { increment: interestToPay } } });
      await tx.ledgerAccount.update({ where: { id: interestIncome.id }, data: { balance: { increment: interestToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: interestReceivable.id, type: "Credit", amount: interestToPay },
        { ledgerAccountId: interestReceived.id, type: "Debit", amount: interestToPay },
        { ledgerAccountId: interestIncome.id, type: "Credit", amount: interestToPay }
      );
      amountToApply -= interestToPay;
    }
    const taxToPay = Math.min(amountToApply, taxDue);
    if (taxToPay > 0) {
      await tx.ledgerAccount.update({ where: { id: taxReceivable.id }, data: { balance: { decrement: taxToPay } } });
      await tx.ledgerAccount.update({ where: { id: taxReceived.id }, data: { balance: { increment: taxToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: taxReceivable.id, type: "Credit", amount: taxToPay },
        { ledgerAccountId: taxReceived.id, type: "Debit", amount: taxToPay }
      );
      amountToApply -= taxToPay;
    }
    const principalToPay = Math.min(amountToApply, principalDue);
    if (principalToPay > 0) {
      await tx.ledgerAccount.update({ where: { id: principalReceivable.id }, data: { balance: { decrement: principalToPay } } });
      await tx.ledgerAccount.update({ where: { id: principalReceived.id }, data: { balance: { increment: principalToPay } } });
      ledgerEntries.push(
        { ledgerAccountId: principalReceivable.id, type: "Credit", amount: principalToPay },
        { ledgerAccountId: principalReceived.id, type: "Debit", amount: principalToPay }
      );
      amountToApply -= principalToPay;
    }
    if (ledgerEntries.length > 0) {
      await tx.ledgerEntry.createMany({
        data: ledgerEntries.map((e) => ({ ...e, journalEntryId: journalEntry.id }))
      });
    }
    const payment = await tx.payment.create({
      data: {
        loanId: loan.id,
        amount: paymentAmount,
        date: today,
        outstandingBalanceBeforePayment: totalDue,
        journalEntryId: journalEntry.id
      }
    });
    const newRepaid = alreadyRepaid + paymentAmount;
    const isFullyPaid = newRepaid >= totals.total - 0.01;
    const repaymentBehavior = isFullyPaid ? differenceInDays(today, startOfDay(loan.dueDate)) > 0 ? "LATE" : "ON_TIME" : null;
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        repaidAmount: newRepaid,
        repaymentStatus: isFullyPaid ? "Paid" : "Unpaid",
        ...isFullyPaid && { penaltyAmount: 0 },
        ...repaymentBehavior && { repaymentBehavior }
      }
    });
    if (isFullyPaid) {
      const remaining = await tx.loan.count({
        where: { borrowerId: loan.borrowerId, repaymentStatus: "Unpaid" }
      });
      if (remaining === 0) {
        await tx.borrower.updateMany({
          where: { id: loan.borrowerId, status: "NPL" },
          data: { status: "Active" }
        });
      }
    }
    return {
      payment,
      applied: {
        penalty: penaltyToPay,
        serviceFee: serviceFeeToPay,
        interest: interestToPay,
        tax: taxToPay,
        principal: principalToPay
      },
      remainingBalance: Math.max(0, totals.total - newRepaid),
      isFullyPaid
    };
  });
  console.log("[CBS-NPL][AutoDebit] Ledger posting committed", {
    loanId,
    paymentId: paymentRecord.payment.id,
    paymentAmount,
    applied: paymentRecord.applied,
    remainingBalance: paymentRecord.remainingBalance
  });
  return {
    paymentId: paymentRecord.payment.id,
    paymentAmount,
    applied: paymentRecord.applied,
    remainingBalance: paymentRecord.remainingBalance,
    isFullyPaid: paymentRecord.isFullyPaid
  };
}
var import_crypto2, truncate, toJsonString, REPAY_TRIGGERING_STATUSES;
var init_cbs_npl = __esm({
  "src/actions/cbs-npl.ts"() {
    "use strict";
    "use server";
    init_prisma();
    import_crypto2 = require("crypto");
    init_date_fns();
    init_client();
    init_loan_calculator();
    init_audit_log();
    init_logger();
    init_sms();
    truncate = (value, max = 4e3) => {
      if (!value) return value;
      return value.length <= max ? value : `${value.slice(0, max)}\u2026(truncated, len=${value.length})`;
    };
    toJsonString = (value) => {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    };
    REPAY_TRIGGERING_STATUSES = /* @__PURE__ */ new Set([
      "PENDING",
      "FAILED",
      "UNMATCHED_ACCOUNT",
      "NO_OUTSTANDING"
    ]);
  }
});

// src/worker.ts
init_logger();

// src/lib/date-utils.ts
init_date_fns();
function getAsOfDate() {
  return startOfDay(/* @__PURE__ */ new Date());
}

// src/worker.ts
var REPAYMENT_INTERVAL_MS = 60 * 60 * 1e3;
var PROVIDER_DISTRIBUTION_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var INTEREST_ACCRUAL_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var PENALTY_ACCRUAL_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var CBS_NPL_UPLOAD_INTERVAL_MS = 24 * 60 * 60 * 1e3;
var NPL_STATUS_INTERVAL_MS = 24 * 60 * 60 * 1e3;
async function runProviderDistributionServiceLoop() {
  while (true) {
    try {
      logger.info("Starting provider distribution scheduled run");
      const { runProviderDistributionOnce: runProviderDistributionOnce2 } = await Promise.resolve().then(() => (init_provider_distribution(), provider_distribution_exports));
      await runProviderDistributionOnce2();
      logger.info("Provider distribution scheduled run finished");
    } catch (error) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error during provider distribution cycle:`, error);
      logger.error(`Error during provider distribution cycle: ${String(error)}`);
    }
    logger.info(`Provider distribution service sleeping for ${Math.round(PROVIDER_DISTRIBUTION_INTERVAL_MS / (60 * 60 * 1e3))}h`);
    await new Promise((resolve) => setTimeout(resolve, PROVIDER_DISTRIBUTION_INTERVAL_MS));
  }
}
async function runInterestAccrualServiceLoop() {
  logger.info("Interest accrual service started");
  while (true) {
    try {
      const asOfDate = getAsOfDate();
      logger.info(`Interest accrual tick at ${asOfDate.toISOString()}`);
      logger.info("Starting daily interest accrual scheduled run");
      const { runDailyInterestAccrualOnce: runDailyInterestAccrualOnce2 } = await Promise.resolve().then(() => (init_interest_accrual2(), interest_accrual_exports));
      const result = await runDailyInterestAccrualOnce2(asOfDate);
      logger.info(`Daily interest accrual finished processedLoans=${result.processedLoans} totalAccrued=${result.totalAccrued}`);
    } catch (error) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error during interest accrual cycle:`, error);
      logger.error(`Error during interest accrual cycle: ${String(error)}`);
    }
    logger.info(`Interest accrual service sleeping for ${Math.round(INTEREST_ACCRUAL_INTERVAL_MS / (60 * 60 * 1e3))}h`);
    await new Promise((resolve) => setTimeout(resolve, INTEREST_ACCRUAL_INTERVAL_MS));
  }
}
async function runPenaltyAccrualServiceLoop() {
  logger.info("Penalty accrual service started");
  while (true) {
    try {
      const asOfDate = getAsOfDate();
      logger.info(`Penalty accrual tick at ${asOfDate.toISOString()}`);
      logger.info("Starting daily penalty accrual scheduled run");
      const { runDailyPenaltyAccrualOnce: runDailyPenaltyAccrualOnce2 } = await Promise.resolve().then(() => (init_penalty_accrual2(), penalty_accrual_exports));
      const result = await runDailyPenaltyAccrualOnce2(asOfDate);
      logger.info(`Daily penalty accrual finished processedLoans=${result.processedLoans} totalAccrued=${result.totalAccrued}`);
    } catch (error) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error during penalty accrual cycle:`, error);
      logger.error(`Error during penalty accrual cycle: ${String(error)}`);
    }
    logger.info(`Penalty accrual service sleeping for ${Math.round(PENALTY_ACCRUAL_INTERVAL_MS / (60 * 60 * 1e3))}h`);
    await new Promise((resolve) => setTimeout(resolve, PENALTY_ACCRUAL_INTERVAL_MS));
  }
}
async function runNplStatusServiceLoop() {
  logger.info("NPL status update service started");
  while (true) {
    try {
      logger.info("Starting daily NPL status update scheduled run");
      const { updateNplStatusJob: updateNplStatusJob2 } = await Promise.resolve().then(() => (init_npl(), npl_exports));
      const result = await updateNplStatusJob2();
      logger.info(`Daily NPL status update finished success=${result.success} updated=${result.updatedCount}`);
    } catch (error) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error during NPL status update cycle:`, error);
      logger.error(`Error during NPL status update cycle: ${String(error)}`);
    }
    logger.info(`NPL status update service sleeping for ${Math.round(NPL_STATUS_INTERVAL_MS / (60 * 60 * 1e3))}h`);
    await new Promise((resolve) => setTimeout(resolve, NPL_STATUS_INTERVAL_MS));
  }
}
async function runCbsNplUploadServiceLoop() {
  logger.info("CBS NPL upload service started");
  while (true) {
    try {
      try {
        const { updateNplStatusJob: updateNplStatusJob2 } = await Promise.resolve().then(() => (init_npl(), npl_exports));
        const nplResult = await updateNplStatusJob2();
        logger.info(`Pre-upload NPL status update finished success=${nplResult.success} updated=${nplResult.updatedCount}`);
      } catch (error) {
        logger.error(`Pre-upload NPL status update failed: ${String(error)}`);
      }
      logger.info("Starting daily CBS NPL bulk upload scheduled run");
      const { uploadNplListToCbs: uploadNplListToCbs2 } = await Promise.resolve().then(() => (init_cbs_npl(), cbs_npl_exports));
      const result = await uploadNplListToCbs2({ source: "SCHEDULED" });
      logger.info(
        `Daily CBS NPL upload finished success=${result.success} batch=${result.batchId} sent=${result.accountsSentCount} inserted=${result.insertedCount ?? "n/a"} existing=${result.alreadyExistsCount ?? "n/a"}`
      );
    } catch (error) {
      console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error during CBS NPL upload cycle:`, error);
      logger.error(`Error during CBS NPL upload cycle: ${String(error)}`);
    }
    logger.info(`CBS NPL upload service sleeping for ${Math.round(CBS_NPL_UPLOAD_INTERVAL_MS / (60 * 60 * 1e3))}h`);
    await new Promise((resolve) => setTimeout(resolve, CBS_NPL_UPLOAD_INTERVAL_MS));
  }
}
async function main() {
  const task = process.argv[2];
  if (!task) {
    console.error("Error: No task specified.");
    process.exit(1);
  }
  logger.info(`Worker started task=${task}`);
  try {
    switch (task) {
      case "provider-distribution-service":
        logger.info("Starting provider-distribution-service long-running loop");
        await runProviderDistributionServiceLoop();
        break;
      case "provider-distribution":
        logger.info("Running one-off provider-distribution");
        {
          const { runProviderDistributionOnce: runProviderDistributionOnce2 } = await Promise.resolve().then(() => (init_provider_distribution(), provider_distribution_exports));
          await runProviderDistributionOnce2();
        }
        logger.info("One-off provider-distribution finished");
        process.exit(0);
        break;
      case "interest-accrual-service":
        logger.info("Starting interest-accrual-service long-running loop");
        await runInterestAccrualServiceLoop();
        break;
      case "interest-accrual":
        logger.info("Running one-off interest-accrual");
        {
          const { runDailyInterestAccrualOnce: runDailyInterestAccrualOnce2 } = await Promise.resolve().then(() => (init_interest_accrual2(), interest_accrual_exports));
          await runDailyInterestAccrualOnce2(/* @__PURE__ */ new Date());
        }
        logger.info("One-off interest-accrual finished");
        process.exit(0);
        break;
      case "penalty-accrual-service":
        logger.info("Starting penalty-accrual-service long-running loop");
        await runPenaltyAccrualServiceLoop();
        break;
      case "penalty-accrual":
        logger.info("Running one-off penalty-accrual");
        {
          const { runDailyPenaltyAccrualOnce: runDailyPenaltyAccrualOnce2 } = await Promise.resolve().then(() => (init_penalty_accrual2(), penalty_accrual_exports));
          await runDailyPenaltyAccrualOnce2(/* @__PURE__ */ new Date());
        }
        logger.info("One-off penalty-accrual finished");
        process.exit(0);
        break;
      case "npl":
        {
          const { updateNplStatusJob: updateNplStatusJob2 } = await Promise.resolve().then(() => (init_npl(), npl_exports));
          await updateNplStatusJob2();
        }
        process.exit(0);
        break;
      case "npl-service":
        logger.info("Starting npl-service long-running loop");
        await runNplStatusServiceLoop();
        break;
      case "cbs-npl-upload":
        logger.info("Running one-off cbs-npl-upload");
        {
          const { uploadNplListToCbs: uploadNplListToCbs2 } = await Promise.resolve().then(() => (init_cbs_npl(), cbs_npl_exports));
          const result = await uploadNplListToCbs2({ source: "SCHEDULED" });
          logger.info(
            `One-off CBS NPL upload finished success=${result.success} batch=${result.batchId} sent=${result.accountsSentCount}`
          );
        }
        process.exit(0);
        break;
      case "cbs-npl-upload-service":
        logger.info("Starting cbs-npl-upload-service long-running loop");
        await runCbsNplUploadServiceLoop();
        break;
      default:
        console.error(`Error: Unknown task "${task}".`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] Error executing task "${task}":`, error);
    process.exit(1);
  }
}
main();
/*! Bundled license information:

react/cjs/react.production.js:
  (**
   * @license React
   * react.production.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Meta Platforms, Inc. and affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
