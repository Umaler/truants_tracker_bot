
// Кастомный поиск в ширину нужен для ручного обнаружения требуемых элементов html'ки.
// Можно использовать и готовые компоненты, но с ними поиск происходит раза в 2 дольше,
// поскольку, например, они не поддерживают поиск только одного эллемента.
// Аргументы:
//   - el - корневой элемент от которого искать
//   - test_function - предикат, определяющий, подходит ли нам текущий узел
//   - return_one - найти только один элемент или все, подходящие по предикату
function bfs_search(el, test_function, return_one = false) {
  let queue = [el]
  let results = []

  while(queue.length > 0) {
    const cur_el = queue.pop().asElement()
    if(test_function(cur_el)) {
      if(return_one) {
        return cur_el
      }
      else {
        results.push(cur_el)
      }
    }
    queue = queue.concat(cur_el.getChildren())
  }

  if(return_one) {
    return null
  }
  else {
    return results
  }
}

// Поиск ноды html'ки по классу.
// Аргументы:
//   - element - корневой элемент от которого искать
//   - classToFind - искомый класс
//   - findOne - искать только одну ноду, или все с таким классом
function getElementByClassName(element, classToFind, findOne=true) {  
  const tester = function(el) {
    const classes_str_mb_null = el.getAttribute('class')
    if(classes_str_mb_null == null) {
      return false
    }

    // классы возвращаются в виде одной строки. Поэтому сначала саму строку проверяем, а потом разбиваем её и проверяем каждый элемент.
    const classes_str = classes_str_mb_null.getValue()
    if(classes_str == classToFind) {
      return true
    }

    const classes = classes_str.split(' ')
    for(i in classes) {
      if(classes[i] == classToFind) {
        return true
      }
    }
    return false
  }
  return bfs_search(element, tester, findOne)
}

// Проверка, является ли указанная неделя частью диапазона, описанного в расписании.
// Аргументы:
//   - week_now - номер недели для которой проверяется расписание (например текущей)
//   - week_type - тип недели, описываемой raw_schedule_str (all, odd, even)
//   - raw_schedule_str - строка, описывающая расписание предмета по неделям (например, '1-3,7,15-16')
function check_for_schedule(week_now, week_type, raw_schedule_str) { 
  if((week_now % 2 == 0) && (week_type == 'odd')) {
    return false
  }
  if((week_now % 2 == 1) && (week_type == 'even')) {
    return false
  }

  // В расписании зачем-то добавляется навидимый пробел между элементами диапазона
  // (например 1-3,\u200B7). Поэтому, убираем его.
  const schedule_str = raw_schedule_str.replace('\u200B', '')

  // Выделяем сами диапазоны
  const schedule_ranges = schedule_str.split(',')
  for(const range of schedule_ranges) {
    const range_borders = range.split("-")

    // Если у нас в подиапазоне только один элемент - значит это был диапазон вроде 7, т.е. конкретный номер недели
    if(range_borders.length == 1) {
      if(week_now == Math.round(Number(range_borders[0].trim()))) {
        return true
      }
    }
    // В противном случае это полноценный диапазон вроде 1-3
    else {
      const left_border = Math.round(Number(range_borders[0].trim()))
      const right_border = Math.round(Number(range_borders[1].trim()))

      if((left_border <= week_now) && (week_now <= right_border)) {
        return true
      }
    }
  }

  return false
}

// Получить время начала первой пары для каждого дня указанного номера недели
// Аргументы:
//   - ween_n - номер недели для которой мы всё это ищем
function get_start_times(week_n) {
  // Для того, чтобы получить расписание, необходимо передать php-скрипту следующие параметры:
  // group - с этим всё понятно - просто название группы (например, ПМИ-122)
  // semester - первый или второй семестер в текущем учебном годе. Чтобы это определить
  //            смотрим на то, в какой половине года мы находимся. Если в первой - то семестер второй и наоборот.
  // year - первый год учебного года. Например, для 2022-2023 учебного года необходимо указать 2022.
  const date_now = new Date()
  const real_year = date_now.getFullYear()
  const is_years_first_part = date_now.getDate() < (365 / 2) ? true : false
  const required_year = is_years_first_part ? real_year - 1 : real_year // year в параметрах php-скрипта
  const semester = is_years_first_part ? 2 : 1

  // Получаем расписание от скрипта. Однако, его необходимо обрамить тегом <html>, чтобы парсер его правильно распознал.
  const raw_schedule_html = '<html>' + UrlFetchApp.fetch(`https://www.mivlgu.ru/out-inf/scala/sch_group.php?semester=${semester}&year=${required_year}&group=${GROUP_NAME}`) + '</html>'; 
  const raw_schedule_doc = XmlService.parse(raw_schedule_html);
  const raw_schedule_root = raw_schedule_doc.getRootElement()

  // Массив, где будет хранится время первой пары для каждого дня недели.
  let schedule = [null, null, null, null, null, null, null]
  for (let i = 1; i <= 7; i++) {
    const current_day_html = getElementByClassName(raw_schedule_root, `day-${i}`)

    if (!current_day_html) {
      continue
    }

    // Пары сгруппированы по слотам (https://disk.yandex.ru/i/aGgIFrdOb86AqQ). На скрине каждый слот обведен красным.
    // Таким образом, время начала привязано не к самой паре, а к слоту.
    // Соответственно, необходимо сначала проверить: есть ли в слоте подходящие по расписанию пары.
    // Аргументы:
    //   - pair_slot - узел html, содержащий информацию о слоте
    const has_pair_in_slot = function(pair_slot) {
      // avail_types - доступные типы недели: все, четные, нечетные
      const avail_types = ['all', 'even', 'odd']
      for(const week_type of avail_types) {
        // Берем все пары в данном слоте, которые принадлежат данному типу недели
        const pairs = getElementByClassName(pair_slot, `type-${week_type}`, false)
        for (pair of pairs) {
          // Получаем "расписание" (набор диапазонов) для данной недели
          const week_range = getElementByClassName(pair, 'number_week').getValue()
          // Если пара будет на требуемой неделе
          if(check_for_schedule(week_n, week_type, week_range)) {
            return true
          }
        }
      }
      return false
    }

    // В слотах время указано в виде строки типа "10:15-11:45".
    // Данная функция из данной строки извлекает начало пары (10:15), а затем
    // переводит в Date.
    // Аргументы:
    //   - str - "сырая" строка доставаемая из html'ки
    const str_time_to_left_border = function(str) {
      const raw_borders = str.split('-')

      const hour_minute = raw_borders[0].trim().split('.')
      const to_int = function(s) {
        return Math.round(Number(s))
      }
 
      let result = new Date()
      result.setTime(0)
      result.setHours(to_int(hour_minute[0]))
      result.setMinutes(to_int(hour_minute[1]))

      return result
    }

    // время начала каждого слота для текущего дня
    let beggins = []
    const pairs_slots = getElementByClassName(current_day_html, 'para', false)
    for(const pair_slot of pairs_slots) {
      if(has_pair_in_slot(pair_slot)) {
        const raw_time = getElementByClassName(pair_slot, 'time').getValue()
      
        beggins.push(str_time_to_left_border(raw_time))
      }
    }
    
    // Для текущего дня задаем время начала, равное времени слота с наименьшим временем начала
    schedule[i - 1] = new Date(Math.min(...beggins))
  }

  return schedule
}

function get_week_number(date) {
  const milliseconds_delta = date.getTime() - SEMESTER_START_DATE.getTime()
  return Math.ceil(milliseconds_delta / 1000 / 60 / 60 / 24 / 7)
}

function get_today_day_of_week() {
  const raw_day_of_week = (new Date()).getDay()
  return raw_day_of_week == 0 ? 6 : raw_day_of_week - 1 // Нужно потому, что у буржуев первый день недели - Воскресенье
}

function get_today_date() {
  nowDate = new Date()
  nowDate.setHours(0, 0, 0, 0)
  return nowDate
}

// Получить время начала занятий на указанный день
// Аргументы:
//   - offset_from_today - сдвиг по дням относительно сегодня (например при offset_from_today=1 вернет время начала занятий завтра)
function getDaysStartTime(offset_from_today = 0) {
  const day_of_week_now = get_today_day_of_week()
  const required_week_day = (day_of_week_now + offset_from_today) % 7

  let required_date = new Date()
  required_date.setDate(required_date.getDate() + offset_from_today)

  const required_week = get_week_number(required_date)
  const schedule = get_start_times(required_week)

  return schedule[required_week_day]
}
