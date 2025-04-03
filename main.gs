
function getScriptSecret(key) {
  let secret = PropertiesService.getScriptProperties().getProperty(key)
  if (!secret) throw Error(`Secret ${key} is empty`)
    return secret
}

const API=getScriptSecret('bot_token')  // Токен телеграм-бота
const GROUP_CHAT_ID=getScriptSecret('group_chat_id')   // ID чата, где всех пинговать
const DEBUG_CHAT_ID=getScriptSecret('debug_chat_id')   // ID чата, куда писать дебаг сообщения
const APP_LINK="https://script.google.com/macros/s/AKfycbyXYp7Zxesd0H9sySI5dIT5XKXftzGSSuiSmgDeQhvDGkabqUNZQxAiCj8bCalNMz6ETg/exec"
const SPREADSHEAT_URL=getScriptSecret('spreadsheet_document')

const DATE_COLUMN=1
const DATE_ROW_START=10
const DATE_ROW_END=87

const NAMES_COLUMN_START=4
const NAMES_COLUMN_END=15
const NAMES_ROW=9

const WILL_BE_FOR_SURE_COLUMN=16
const UNKNOWN_COLUMN=17
const WILL_BE_PARTIALY_COLUMN=18
const WONT_BE=19

const GROUP_NAME='ПМИ-122'
const REQUIRED_PEOPLE=5

const SEMESTER_START_DATE = new Date('2025-02-03')

const EVENING_PING_TIME = 21       // Час, в который вечером надо пингануть народ. !!!Должно быть целым числом!!!
const TRIGGER_TIME_DELTA = 1.5     // Разница между временем вызова триггера и требуемым временем. Задается в часах. Необходимо, поскольку триггер вызывается раз в час.
const TRIGGER_TIME_EPSILON = 0.25  // Погрешность времени вызова. Необходима, поскольку пары начинаются то час в час (например, 14:00), то за пол часа (8:30), то вообще не пойми когда (10:15)

const WILL_BE_STATUS = 'Буду на всех парах'
const PARTIAL_STATUS = 'Буду частично'
const WONT_BE_STATUS = 'Не буду'

const set_status_keyboard =  {
  "inline_keyboard":
    [
      [{"text": "Буду на всех парах"}],
      [{"text": "Буду частично"}],
      [{"text": "Не буду"}],
      [{"text": "Не знаю"}]
    ]
}

function send (msg, chat_id, keyboard=null) {
  payload = {}
  if (keyboard == null) {
    payload = {
      'method': 'sendMessage',
      'chat_id': String(chat_id),
      'text': String(msg),
      'parse_mode': 'Markdown'
    }
  }
  else {
    payload = {
      'method': 'sendMessage',
      'chat_id': String(chat_id),
      'text': String(msg),
      'parse_mode': 'Markdown',
      'reply_markup': JSON.stringify(keyboard)
    }
  }
  let data = {
    'method': 'post',
    'payload': payload,
    'muteHttpExceptions': true
  }
  UrlFetchApp.fetch('https://api.telegram.org/bot' + API + '/', data);
}

function debug_send(msg) {
  send(msg, DEBUG_CHAT_ID)
}

function get_row_by_today(days_offset=0) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("truants")
  const dates = sheet.getRange(DATE_ROW_START, 1, DATE_ROW_END - DATE_ROW_START + 1, 1).getValues()
  const todays_date = String(get_today_date())

  const required_row = (
    () =>
    {
      for (let i = 0; i < dates.length; i++) {
        if(String(dates[i]) == todays_date) {
          return i + days_offset
        }
      }
    }
  )() + DATE_ROW_START
  
  return required_row
}

function get_numbers(days_offset=0) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("truants")

  const required_row = get_row_by_today(days_offset)

  const will_be = Number(sheet.getRange(required_row, WILL_BE_FOR_SURE_COLUMN, 1, 1).getValue())
  const unknown = Number(sheet.getRange(required_row, UNKNOWN_COLUMN, 1, 1).getValue())
  const partial = Number(sheet.getRange(required_row, WILL_BE_PARTIALY_COLUMN, 1, 1).getValue())
  const wont_be = Number(sheet.getRange(required_row, WONT_BE, 1, 1).getValue())

  return {
    "will be": will_be,
    "unknown": unknown,
    "partial": partial,
    "wont be": wont_be
  }
}

function textual_statistics(days_offset=0) {
  numbers=get_numbers(days_offset)

  return  "Точно придут: " + numbers["will be"] + "\n" +
          "Придут на часть пар: " + numbers["partial"] + "\n" +
          "Неизвестно: " + numbers["unknown"] + "\n" +
          "Точно не придут: " + numbers["wont be"]
}

function get_status(days_offset=0) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("truants")

  const required_row = get_row_by_today(days_offset)

  let result = {}
  for (let column = NAMES_COLUMN_START; column <= NAMES_COLUMN_END; column++) {
    const name = String(sheet.getRange(NAMES_ROW, column, 1, 1).getValue())
    const status = String(sheet.getRange(required_row, column, 1, 1).getValue())
    result[name]=status
  }

  return result
}

function get_textual_status(days_offset=0) {
  const status = get_status(days_offset)
  result = ""
  for (k in status) {
    if(status[k] != "") {
      result += k + ": " + status[k] + "\n"
    }
    else {
      result += k + ": ???" + "\n"
    }
  }
  return result
}

function get_column_by_id(id) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const tgsheet = doc.getSheetByName("tg_names")
  const ids = tgsheet.getDataRange().getValues()
  const mainsheet = doc.getSheetByName("truants")

  const found_name = (
    () =>
    {
      for(let i = 0; i < ids.length; i++) {
        if(String(ids[i][0]) == id) {
          return String(ids[i][1])
        }
      }
    }
  )()
  if(found_name == null) {
    return
  }
  
  const users_column = (
    () =>
    {
      all_names = mainsheet.getRange(NAMES_ROW, NAMES_COLUMN_START, 1, NAMES_COLUMN_END-NAMES_COLUMN_START+1).getValues()
      for(let i = 0; i < all_names[0].length; i++) {
        if(all_names[0][i] == found_name) {
         return i + NAMES_COLUMN_START
        }
      }
    }
  )()
  if(users_column == null) {
    return
  }

  return users_column
}

function addPrefixesToKeyboard(keyboard, prefix) {
  const len = keyboard["inline_keyboard"].length
  for(let i = 0; i < len; i++) {
    keyboard["inline_keyboard"][i][0]["callback_data"] = prefix + keyboard["inline_keyboard"][i][0]["text"]
  }
  return keyboard
}

function set_user_status(id, status, date_offset = 0) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("truants")

  const users_column = get_column_by_id(id)
  if(users_column == null) {
    send("Не нашел по имени", DEBUG_CHAT_ID)
    return
  }

  const required_row = get_row_by_today(date_offset)
  if(required_row == null) {
    send("Не нашел строку", DEBUG_CHAT_ID)
    return
  }

  sheet.getRange(required_row, users_column).setValue(status)
}

function getIdByName(name) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("tg_names")
  const ids = sheet.getDataRange().getValues()

  for(let i = 0; i < ids.length; i++) {
    if(String(ids[i][1]) == name) {
      return String(ids[i][0])
    }
  }

  return null
}

function getNameById(id) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("tg_names")
  const ids = sheet.getDataRange().getValues()

  for(let i = 0; i < ids.length; i++) {
    if(String(ids[i][0]) == id) {
      return String(ids[i][1])
    }
  }

  return null
}

function getUserStatus(id, date_offset) {
  const doc = SpreadsheetApp.openByUrl(SPREADSHEAT_URL)
  const sheet = doc.getSheetByName("truants")

  const users_column = get_column_by_id(id)
  if(users_column == null) {
    send("Не нашел по имени", DEBUG_CHAT_ID)
    return
  }

  const required_row = get_row_by_today(date_offset)
  if(required_row == null) {
    send("Не нашел строку", DEBUG_CHAT_ID)
    return
  }

  return sheet.getRange(required_row, users_column).getValue()
}

function ping_people(days_offset) {
  function get_shifted_date_str() {
    let date_res = new Date()
    date_res.setDate(date_res.getDate() + days_offset)

    const str_options = {
        weekday: "long",
        month: "long",
        day: "numeric"
    }

    return result.toLocaleDateString("ru-RU", str_options)
  }

  const when = days_offset == 0 ? 'сегодня' :
               days_offset == 1 ? 'завтра' :
               get_shifted_date_str()

  const stats = get_numbers(days_offset)
  const by_names = get_status(days_offset)

  function get_ids_by_status(status) {
    // null - типо не определившиеся
    if(status == null) {
      const STATUSES = [WILL_BE_STATUS, PARTIAL_STATUS, WONT_BE_STATUS]
      let result = []

      for(name in by_names) {
        if(!STATUSES.includes(by_names[name])) {
          result.push(getIdByName(name))
        }
      }

      return result
    }
    else {
      let result = []

      for(name in by_names) {
        if(by_names[name] == status) {
          result.push(getIdByName(name))
        }
      }

      return result
    }
  }

  function make_ping_msg(prefix, to_ping_ids) {
    let result = String(prefix)
    for(const id of to_ping_ids) {
      result += `\n[${getNameById(id)}](tg://user?id=${id})`
    }
    return result
  }

  const will_be = stats['will be']
  if(will_be >= REQUIRED_PEOPLE) {
    return
  }

  const partials_n = stats['partial'] + will_be
  const partials = get_ids_by_status(PARTIAL_STATUS)
  if(partials_n >= REQUIRED_PEOPLE) {
    const ping_msg = make_ping_msg(`Оповещение о: ${when}.\nСлишком много тех, кто будет частично. Договоритесь, чтобы на всех парах было достаточное количество людей.`, partials)
    send(ping_msg, GROUP_CHAT_ID)
    return
  }

  const dont_knows_n = stats['unknown']
  const dont_knows = Object.assign({}, partials, get_ids_by_status(null));
  if(dont_knows_n >= REQUIRED_PEOPLE) {
    const ping_msg = make_ping_msg(`Оповещение о: ${when}.\nСлишком много тех, кто будет частично и не определились. Отметьтесь и договоритесь, чтобы на всех парах было достаточное количество людей.`, dont_knows)
    send(ping_msg, GROUP_CHAT_ID)
    return
  }

  const wont_be = Object.assign({}, dont_knows, get_ids_by_status(WONT_BE_STATUS));
  const ping_msg = make_ping_msg(`Оповещение о: ${when}.\nЛюдей слишком мало!!! Слишком много тех, кого точно не будет!!! Отметьтесь, договоритесь!!!`, wont_be)
  send(ping_msg, GROUP_CHAT_ID)
}

function ping_people_today() {
  ping_people(0)
}

function ping_people_tomorrow() {
  ping_people(1)
}

function trigger_wakeup() {
  try {
    const today_starting_time = getDaysStartTime()
    const hour_now = (new Date()).getHours() + (new Date()).getMinutes() / 60

    if((today_starting_time - hour_now + TRIGGER_TIME_EPSILON < TRIGGER_TIME_DELTA) && 
       (today_starting_time - hour_now - TRIGGER_TIME_EPSILON > TRIGGER_TIME_DELTA)
      ) { // Время перед первой парой сегодня
      debug_send(`Пора пинговать на сегодня!`)
      ping_people_today()
    }
    else if(EVENING_PING_TIME == Math.round(hour_now)) {
      debug_send(`Пора пинговать на завтра!`)
      ping_people_tomorrow()
    }
  }
  catch(e) {
    debug_send(`Ошибка в trigger_wakeup: ${e}`)
  }
}

function doGet(e) {
  var params = JSON.stringify(e);
  return HtmlService.createHtmlOutput(params);
}

function doPost(e) {
  const update = JSON.parse(e.postData.contents);
  if (update.hasOwnProperty('message')) {
    try {
      const msg = update.message;
      const chat_id = msg.chat.id;
      const text = msg.text;
      const userId = msg.from.id;

      const msg_parts = text.split('@')
      if(!(msg_parts.length == 1) && !((msg_parts.length == 2) && (msg_parts[1] == 'truants_tracker_bot'))) {
        return
      }
      const command = msg_parts[0]

      switch(command) {
        case "/my_status":
          restext = "Сегодня: " + getUserStatus(userId, 0) + "\nЗавтра: " + getUserStatus(userId, 1)
          send(restext, chat_id)
          break

        case "/get_today_numbers":
          send(textual_statistics(0), chat_id)
          break

        case "/get_tomorrow_numbers":
          send(textual_statistics(1), chat_id)
          break

        case "/get_details_today":
          send(get_textual_status(0), chat_id)
          break

        case "/get_details_tomorrow":
          send(get_textual_status(1), chat_id)
          break

        case "/set_status_today":
          send("Выберите статус на сегодня", chat_id, addPrefixesToKeyboard(set_status_keyboard, "ssn_"))
          break

        case "/set_status_tomorrow":
          send("Выберите статус на завтра", chat_id, addPrefixesToKeyboard(set_status_keyboard, "sst_"))
          break
      }
    }
    catch(e) {
      send("Произошла ошибка:\n" + String(e), DEBUG_CHAT_ID)
    }
  }
  else if(update.hasOwnProperty('callback_query')) {
    try {
      const text = update.callback_query.message.text
      const receivedData = update.callback_query.data
      const userId = update.callback_query.from.id
      const chatId = update.callback_query.message.chat.id

      const prefix = receivedData.substring(0, 4)
      const value  = receivedData.substring(4)

      switch(prefix) {
        case "ssn_":
          set_user_status(userId, value)
          send(`Установили статус "${value}" на сегодня!`, chatId)
          break

        case "sst_":
          set_user_status(userId, value, 1)
          send(`Установили статус "${value}" на завтра!`, chatId)
          break
      }
    }
    catch(e) {
      send("Произошла ошибка:\n" + String(e), DEBUG_CHAT_ID)
    }
  }
}

function api_connector () {
  const conresponse = UrlFetchApp.fetch("https://api.telegram.org/bot"+API+"/setWebHook?url="+APP_LINK); 
  Logger.log(conresponse.getContentText());
}

function main() {
  
}
