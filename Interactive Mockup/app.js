// CareerBridge mockup behaviour.
// The student's answers and plan are saved only for the current browser tab session.
// There is no recommendation algorithm yet: scores and skill levels are random placeholders.

// The -v3 suffix starts with a blank profile, without the earlier sample answers or planned courses.
const STORAGE_KEY = 'careerbridge-student-v3'
try {
  // Remove any saved trial from the earlier persistent-storage version of the mockup.
  localStorage.removeItem(STORAGE_KEY)
} catch {
  // Storage may be unavailable in a restricted browser context.
}
const DEGREE_ECTS = 240
const HOURS_PER_ECTS = 25
const TEACHING_WEEKS = 13

/* Saved student */

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function loadStudent() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY))
    if (saved) return { ...copy(CB_DATA.sampleStudent), ...saved }
  } catch {
    // Storage can be blocked, for example in a private window. The sample student is used instead.
  }
  return copy(CB_DATA.sampleStudent)
}

function saveStudent() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(student))
  } catch {
    // Without storage, changes last until the page is left.
  }
}

const student = loadStudent()

/* Catalogue */

const coursesById = new Map(CB_DATA.courses.map((c) => [c.id, c]))

function courseById(id) {
  return coursesById.get(id)
}

function departmentName() {
  return CB_DATA.departments.find((d) => d.id === student.department)?.name ?? ''
}

function careersFor(departmentId) {
  return CB_DATA.careers.filter((c) => c.departments.includes(departmentId))
}

function currentCareer() {
  if (!student.department || !student.career) return undefined
  const options = careersFor(student.department)
  return options.find((c) => c.id === student.career)
}

function isMandatory(course) {
  if (course.department === 'economics') return course.type === 'Compulsory'
  return course.semester <= 2
}

function courseKind(course) {
  return isMandatory(course) ? 'Mandatory' : 'Elective'
}

/** Courses up to the end of the given year (two semesters a year), offered as completed-course ticks. */
function coursesUpToYear(departmentId, year) {
  return CB_DATA.courses.filter((c) => c.department === departmentId && c.semester <= year * 2)
}

/** Electives, which the app can recommend. */
function electiveCourses(departmentId) {
  return CB_DATA.courses.filter((c) => c.department === departmentId && !isMandatory(c) && c.recommendable !== false)
}

function weeklyHours(course) {
  return Number(((course.ects * HOURS_PER_ECTS) / TEACHING_WEEKS).toFixed(1))
}

/* Placeholder results. The real app will get these from the recommendation algorithm. */

/**
 * A random-looking number from 0 to 1 that is always the same for the same inputs, so results
 * stay put when moving between pages but change completely with another department or career.
 */
function randomFor(...parts) {
  let hash = 2166136261
  for (const char of parts.join('|')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0x5bd1e995)
  hash ^= hash >>> 15
  return (hash >>> 0) / 4294967296
}

function randomInt(min, max, ...parts) {
  return min + Math.floor(randomFor(...parts) * (max - min + 1))
}

function resultSeed() {
  return `${student.department}|${currentCareer().id}`
}

/** The student's level (0 to 100) in each skill of the chosen career today. */
function todayLevels() {
  return Object.fromEntries(currentCareer().skills.map((id) => [id, randomInt(0, 85, resultSeed(), 'today', id)]))
}

const resultCache = new Map()

/** Match score and the skills a course raises, with how many points it adds to each. */
function courseResult(course) {
  const seed = resultSeed()
  const key = `${seed}|${course.id}`
  if (!resultCache.has(key)) {
    const skills = [...currentCareer().skills].sort((a, b) => randomFor(seed, course.id, a) - randomFor(seed, course.id, b))
    const count = randomInt(2, 3, seed, course.id, 'count')
    const boosts = Object.fromEntries(skills.slice(0, count).map((id) => [id, randomInt(15, 50, seed, course.id, id, 'boost')]))
    resultCache.set(key, { match: randomInt(20, 99, seed, course.id, 'match'), boosts })
  }
  return resultCache.get(key)
}

/** Skill levels after taking the given courses. */
function levelsWith(courseIds) {
  const levels = todayLevels()
  for (const id of courseIds) {
    for (const [skill, boost] of Object.entries(courseResult(courseById(id)).boosts)) {
      levels[skill] = Math.min(100, levels[skill] + boost)
    }
  }
  return levels
}

/** How well the student matches the career: the average of their skill levels. */
function alignment(levels) {
  const values = Object.values(levels)
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function skillNames(course) {
  const names = Object.keys(courseResult(course).boosts).map((id) => CB_DATA.skills[id])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
}

/* Student helpers */

function $(selector) {
  return document.querySelector(selector)
}

/** Up to two initials for the avatar, like "D" for Danae or "DP" for Danae Papadaki. */
function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

function ordinal(n) {
  return n + (['th', 'st', 'nd', 'rd'][n] ?? 'th')
}

function hoursText(hours) {
  return `${Number(hours.toFixed(1))} h`
}

function courseUrl(id) {
  return `course.html?id=${id}`
}

/** The course-guide line shown under every course name, like "3743 · 6 ECTS · 8th sem". */
function guideLine(course) {
  const semesters = course.offeredSemesters ?? [course.semester]
  return `${course.code} · ${course.ects} ECTS · ${semesters.map(ordinal).join('/')} sem`
}

/**
 * Ticks are kept even for courses after the student's current year, so moving to an earlier year
 * and back loses nothing. Only ticks up to the current year count.
 */
function isCompleted(id) {
  return student.completed.includes(id) && courseById(id)?.semester <= student.year * 2
}

function completedCourses() {
  return student.completed.filter(isCompleted)
}

function isPlanned(id) {
  return student.planned.includes(id)
}

/** A course can be taken once any one of its prerequisites is completed. */
function isAvailable(course) {
  return course.prerequisites.length === 0 || course.prerequisites.some((id) => isCompleted(id))
}

function togglePlanned(id) {
  student.planned = isPlanned(id) ? student.planned.filter((x) => x !== id) : [...student.planned, id]
  saveStudent()
}

function totalHours() {
  return student.planned.reduce((sum, id) => sum + weeklyHours(courseById(id)), 0)
}

function byMatch(a, b) {
  return courseResult(b).match - courseResult(a).match
}

/** The recommendations: the best courses the student can take now, and a few to unlock later. */
function recommendations() {
  const candidates = electiveCourses(student.department).filter((c) => !isCompleted(c.id)).sort(byMatch)
  return {
    now: candidates.filter(isAvailable).slice(0, 6),
    later: candidates.filter((c) => !isAvailable(c)).slice(0, 3),
  }
}

/** Compares the forecast with the time the student has. */
function workloadFit(needed, available) {
  const difference = Math.abs(available - needed).toFixed(1).replace('.0', '')
  const ratio = available / needed
  if (ratio >= 1.1) return { label: 'Comfortable', tone: 'good', text: `You would have about ${difference} hours to spare each week` }
  if (ratio >= 0.9 && available >= needed) return { label: 'Tight', tone: 'warn', text: `You would have only about ${difference} hours to spare each week` }
  if (ratio >= 0.9) return { label: 'Tight', tone: 'warn', text: `You would need about ${difference} more hours each week` }
  return { label: 'Too much', tone: 'bad', text: `You would need about ${difference} more hours each week. Consider fewer courses.` }
}

function skillBar(name, now, next, valueText) {
  return `
    <div>
      <div class="skill-name">${name} <span>${valueText}</span></div>
      <div class="bar" style="--now:${now}%;--next:${next}%" role="img" aria-label="${name}: ${valueText}"></div>
    </div>`
}

function recommendationCard(course) {
  const statuses = []
  if (isPlanned(course.id)) statuses.push('<span class="status good">In your plan</span>')
  if (!isAvailable(course)) statuses.push('<span class="status warn">Needs a prerequisite</span>')
  return `
    <a class="card" href="${courseUrl(course.id)}">
      <div class="rec-top">
        <div>
          <h3>${course.name}</h3>
          <p class="meta">${guideLine(course)}</p>
        </div>
        <p class="match">${courseResult(course).match}%<small>match</small></p>
      </div>
      <p class="rec-why">Builds ${skillNames(course)}</p>
      ${statuses.length ? `<p class="statuses">${statuses.join('')}</p>` : ''}
    </a>`
}

/** The completed-course ticks, grouped by semester, for setup step 2 and the "Your courses" page. */
function courseChecklist() {
  const list = $('#course-groups')
  if (!student.department || !student.year) {
    list.innerHTML = '<p class="empty-hint">Choose your department and year of study first.</p>'
    return
  }
  const courses = coursesUpToYear(student.department, student.year)
  const semesters = [...new Set(courses.map((c) => c.semester))].sort((a, b) => a - b)
  list.innerHTML = semesters
    .map((semester) => {
      const group = courses.filter((c) => c.semester === semester)
      const mandatoryCount = group.filter(isMandatory).length
      const semesterKind = mandatoryCount === group.length ? 'Mandatory' : mandatoryCount ? 'Mandatory and elective options' : 'Electives'
      const rows = group.map((c) => `<label class="check"><input type="checkbox" value="${c.id}" ${isCompleted(c.id) ? 'checked' : ''}><span class="check-course"><span>${c.name}</span><small>${courseKind(c)}</small></span></label>`)
      return `<section class="card semester-group" data-semester="${semester}"><div class="semester-head"><h3>${ordinal(semester)} semester · ${semesterKind}</h3><button class="select-all" type="button" data-semester="${semester}">Select all</button></div>${rows.join('')}</section>`
    })
    .join('')
  if (courses.length === 0) {
    list.innerHTML = '<p class="empty-hint">No courses are listed for these choices.</p>'
  }
  const syncSelectAllButtons = () => {
    list.querySelectorAll('.semester-group').forEach((section) => {
      const inputs = [...section.querySelectorAll('input[type="checkbox"]')]
      const button = section.querySelector('.select-all')
      const allSelected = inputs.length > 0 && inputs.every((input) => input.checked)
      button.textContent = allSelected ? 'Deselect all' : 'Select all'
      button.setAttribute('aria-pressed', String(allSelected))
    })
  }
  const saveVisibleCourses = () => {
    // Keep ticks on courses this list does not show, like those after the current year.
    const shown = new Set(courses.map((c) => c.id))
    const ticked = [...list.querySelectorAll('input:checked')].map((input) => input.value)
    student.completed = [...student.completed.filter((id) => !shown.has(id)), ...ticked]
    saveStudent()
    syncSelectAllButtons()
  }
  list.onchange = saveVisibleCourses
  list.onclick = (event) => {
    const button = event.target.closest('.select-all')
    if (!button) return
    const section = button.closest('.semester-group')
    const inputs = [...section.querySelectorAll('input[type="checkbox"]')]
    const allSelected = inputs.length > 0 && inputs.every((input) => input.checked)
    inputs.forEach((input) => { input.checked = !allSelected })
    saveVisibleCourses()
  }
  syncSelectAllButtons()
}

/** The name field, for setup step 1 and the "Your details" page reached from Home. */
function nameField() {
  const name = $('#name')
  name.value = student.name
  name.addEventListener('input', () => {
    student.name = name.value.trim()
    saveStudent()
  })
}

/** The year-of-study chips, for setup step 1 and the "Your details" page. */
function yearChoice() {
  for (const input of document.querySelectorAll('input[name="year"]')) {
    input.checked = Number(input.value) === student.year
    input.addEventListener('change', () => {
      // Ticks after the new year are kept, not removed, in case the student is only checking.
      student.year = Number(input.value)
      saveStudent()
    })
  }
}

/** The career goal choices, for setup step 3 and the "Your career goal" page reached from Home. */
function careerChoices() {
  const list = $('#career-list')
  const careers = careersFor(student.department)
  if (!careers.length) {
    list.innerHTML = '<p class="empty-hint">Choose your department in the previous step to see career goals.</p>'
    return
  }
  list.innerHTML = careers
    .map(
      (career) => `
      <div>
        <input class="sr" type="radio" name="career" id="c-${career.id}" value="${career.id}" ${career.id === student.career ? 'checked' : ''}>
        <label class="choice" for="c-${career.id}">
          <strong>${career.name}</strong>
          <span class="muted">${career.description}</span>
        </label>
      </div>`,
    )
    .join('')
  list.addEventListener('change', (event) => {
    student.career = event.target.value
    saveStudent()
  })
}

/* Pages. Each HTML file names its page in <body data-page="...">. */

const pages = {
  setupProfile() {
    nameField()
    yearChoice()

    for (const input of document.querySelectorAll('input[name="department"]')) {
      input.checked = input.value === student.department
      input.addEventListener('change', () => {
        // A new department has its own courses and careers, so the record and plan start over.
        student.department = input.value
        student.completed = []
        student.planned = []
        student.career = ''
        saveStudent()
      })
    }
  },

  // Name and year only: changing department would clear the record and plan, so it stays in setup.
  myProfile() {
    nameField()
    yearChoice()
  },

  setupCourses() {
    courseChecklist()
  },

  myCourses() {
    $('#courses-subtitle').textContent = student.year ? `Up to your ${ordinal(student.year)} year` : 'Choose your department and year first'
    courseChecklist()
  },

  setupCareer() {
    careerChoices()
  },

  myCareer() {
    careerChoices()
  },

  home() {
    document.querySelectorAll('[data-exit]').forEach((link) => link.addEventListener('click', () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // The link still returns to the welcome screen if storage is unavailable.
      }
    }))
    const career = currentCareer()
    if (!career || !student.year) {
      location.replace('setup-profile.html')
      return
    }
    const today = todayLevels()
    const withPlan = levelsWith(student.planned)
    const ects = completedCourses().reduce((sum, id) => sum + courseById(id).ects, 0)
    const hours = totalHours()
    const now = Math.round(alignment(today))

    const name = student.name || 'Student'
    $('#student-name').textContent = name
    $('#avatar').textContent = initials(name)
    // Each fact is its own span, so a long department name wraps between facts instead of inside one.
    const facts = [`AUEB ${departmentName()}`, `${ordinal(student.year)} year`]
    $('#student-meta').replaceChildren(
      ...facts.flatMap((text, i) => {
        const span = document.createElement('span')
        span.textContent = text
        return i ? [' ', span] : [span]
      }),
    )
    $('#career-name').textContent = career.name
    $('#compact-name').textContent = name
    $('#compact-avatar').textContent = initials(name)
    const scrollArea = document.querySelector('.home-scroll')
    const shell = document.querySelector('.home-profile-shell')
    const profile = document.querySelector('.collapsing-profile')
    const expanded = document.querySelector('.profile-expanded')
    const compact = document.querySelector('.profile-compact')
    let expandedHeight = 0
    let scrollFrame = 0
    const updateProfile = () => {
      scrollFrame = 0
      const distance = Math.max(1, expandedHeight - 64)
      const progress = Math.min(1, Math.max(0, scrollArea.scrollTop / distance))
      profile.style.height = `${expandedHeight - distance * progress}px`
      expanded.style.opacity = String(Math.max(0, 1 - progress * 1.8))
      compact.style.opacity = String(Math.max(0, (progress - 0.55) / 0.45))
      const isCompact = progress >= 0.65
      // Only the visible version participates in keyboard navigation.
      if (isCompact && expanded.contains(document.activeElement)) compact.querySelector('a').focus({ preventScroll: true })
      if (!isCompact && compact.contains(document.activeElement)) expanded.querySelector('a').focus({ preventScroll: true })
      expanded.inert = isCompact
      compact.inert = !isCompact
      expanded.setAttribute('aria-hidden', String(isCompact))
      compact.setAttribute('aria-hidden', String(!isCompact))
      profile.style.borderRadius = `0 0 ${26 - 10 * progress}px ${26 - 10 * progress}px`
    }
    const measureProfile = () => {
      expandedHeight = expanded.offsetHeight
      shell.style.height = `${expandedHeight}px`
      updateProfile()
    }
    scrollArea.addEventListener('scroll', () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateProfile)
    }, { passive: true })
    new ResizeObserver(measureProfile).observe(expanded)
    measureProfile()
    $('#skills-title').textContent = `Skills for ${career.name}`
    $('#fit-now').textContent = `${now}%`
    $('#fit-gain').textContent = `${Math.round(alignment(withPlan))}% with your plan`
    $('#fit-gain').hidden = student.planned.length === 0
    $('#goal-text').textContent = student.planned.length
      ? `Share of the skills ${career.name} roles need that your completed courses cover`
      : `Share of the skills ${career.name} roles need that your completed courses cover. Add courses to your plan to raise it.`
    $('#stat-completed').textContent = completedCourses().length
    $('#stat-planned').textContent = student.planned.length
    $('#stat-ects').textContent = `${ects}/${DEGREE_ECTS}`

    $('#skill-bars').innerHTML = career.skills
      .map((id) => {
        const value = withPlan[id] > today[id] ? `${today[id]}% → ${withPlan[id]}%` : `${today[id]}%`
        return skillBar(CB_DATA.skills[id], today[id], withPlan[id], value)
      })
      .join('')
    $('#top-picks').innerHTML = recommendations().now.slice(0, 2).map(recommendationCard).join('')

    $('#workload-value').innerHTML = hours ? `${hoursText(hours)}<small>per week</small>` : '–'
    $('#workload-text').textContent = hours ? 'See if your plan fits the time you have' : 'Your plan is empty. Add courses to see a forecast.'
  },

  recommendations() {
    if (!currentCareer()) {
      location.replace('setup-profile.html')
      return
    }
    const { now, later } = recommendations()
    $('#career-subtitle').textContent = `For your ${currentCareer().name} goal`
    $('#my-courses').textContent = `Your completed courses · ${completedCourses().length}`
    $('#now-title').textContent = `Available now · ${now.length}`
    $('#now-list').innerHTML = now.map(recommendationCard).join('') || '<p class="muted">No course is available right now</p>'
    $('#later-title').textContent = `Unlock later · ${later.length}`
    $('#later-list').innerHTML = later.map(recommendationCard).join('') || '<p class="muted">Nothing is waiting on a prerequisite</p>'
  },

  course() {
    const course = courseById(new URLSearchParams(location.search).get('id'))
    if (!course) {
      location.replace('recommendations.html')
      return
    }
    document.title = `${course.name} · CareerBridge`
    $('#title').textContent = course.name
    $('#subtitle').textContent = course.nameEl
    $('#compare-link').href = `compare.html?a=${course.id}`

    const render = () => {
      const available = isAvailable(course)
      const planned = isPlanned(course.id)
      const result = courseResult(course)
      const today = todayLevels()
      const unlocks = electiveCourses(course.department).filter((c) => c.prerequisites.includes(course.id)).slice(0, 3)

      const status = (id) => {
        if (isCompleted(id)) return '<span class="status good">Completed</span>'
        if (isPlanned(id)) return '<span class="status good">In your plan</span>'
        return '<span class="status">Not taken</span>'
      }

      $('#course-body').innerHTML = `
        <div class="stack">
          <p class="meta">${guideLine(course)} · ${courseKind(course)} ·${hoursText(weeklyHours(course))}/wk</p>
          ${planned ? '<p class="statuses"><span class="status good">In your plan</span></p>' : ''}
          ${course.summary ? `<p>${course.summary}</p>` : ''}
        </div>

        <section class="card">
          <div class="rec-top">
            <h3>Why this course</h3>
            <p class="match">${result.match}%<small>match</small></p>
          </div>
          <p class="rec-why">It builds ${skillNames(course)}, skills that ${currentCareer().name} roles need.${available ? '' : ' You need a prerequisite first.'}</p>
        </section>

        <section>
          <div class="section-head"><h2>Effect on your skills</h2></div>
          <div class="card stack">
            <div class="skills">
              ${Object.entries(result.boosts)
                .map(([id, boost]) => {
                  const after = Math.min(100, today[id] + boost)
                  return skillBar(CB_DATA.skills[id], today[id], after, `${today[id]}% → ${after}%`)
                })
                .join('')}
            </div>
            <p class="legend"><span class="key">Today</span><span class="key next">After this course</span></p>
          </div>
        </section>

        <section>
          <div class="section-head"><h2>Prerequisites</h2></div>
          <div class="card">
            ${
              course.prerequisites.length
                ? `<p class="muted">${course.prerequisites.length > 1 ? 'You need any one of these.' : 'You need this course first.'}</p>
                   <ul class="rows">
                     ${course.prerequisites.map((id) => `<li><span>${courseById(id).name}</span>${status(id)}</li>`).join('')}
                   </ul>`
                : '<p class="muted">None listed in the guide</p>'
            }
          </div>
        </section>

        ${
          unlocks.length
            ? `<section>
                <div class="section-head"><h2>This course unlocks</h2></div>
                <div class="stack">${unlocks.map(recommendationCard).join('')}</div>
              </section>`
            : ''
        }`

      // A planned course can always be removed, even if a prerequisite was unticked since.
      const action = $('#plan-action')
      const locked = !available && !planned
      action.disabled = locked
      action.className = locked ? 'btn locked' : planned ? 'btn ghost' : 'btn'
      action.textContent = locked ? 'Complete a prerequisite first' : planned ? 'Remove from plan' : 'Add to plan'
    }

    $('#plan-action').addEventListener('click', () => {
      togglePlanned(course.id)
      const toast = $('#toast')
      toast.innerHTML = isPlanned(course.id) ? 'Added to your plan <a href="plan.html">View plan</a>' : 'Removed from your plan'
      toast.hidden = false
      render()
    })
    render()
  },

  compare() {
    const career = currentCareer()
    if (!career) {
      $('#pick-a').innerHTML = '<option value="">Choose a career goal first</option>'
      $('#pick-b').innerHTML = '<option value="">Choose a career goal first</option>'
      $('#comparison').innerHTML = '<p class="empty-hint">Complete your profile and choose a career goal before comparing courses.</p>'
      return
    }
    const { now, later } = recommendations()
    const ids = [...new Set([...now, ...later].map((c) => c.id).concat(student.planned))]
    const params = new URLSearchParams(location.search)
    const requested = params.get('a')
    if (courseById(requested) && !ids.includes(requested)) ids.unshift(requested)
    let a = ids.includes(requested) ? requested : ''
    let b = ''

    const options = `<option value="">Choose a course</option>${ids.map((id) => `<option value="${id}">${courseById(id).name}</option>`).join('')}`
    const pickA = $('#pick-a')
    const pickB = $('#pick-b')
    pickA.innerHTML = options
    pickB.innerHTML = options
    pickA.value = a || ''
    pickB.value = b

    const render = () => {
      if (!a || !b) {
        $('#comparison').innerHTML = '<p class="empty-hint">Choose two courses to compare their skills.</p>'
        return
      }
      if (a === b) {
        $('#comparison').innerHTML = '<p class="note">Pick two different courses to compare.</p>'
        return
      }
      const career = currentCareer()
      const courseA = courseById(a)
      const courseB = courseById(b)
      const today = todayLevels()
      const withA = levelsWith([a])
      const withB = levelsWith([b])
      const gainA = alignment(withA) - alignment(today)
      const gainB = alignment(withB) - alignment(today)
      const boostsA = courseResult(courseA).boosts
      const boostsB = courseResult(courseB).boosts
      const skillIds = career.skills.filter((id) => id in boostsA || id in boostsB)
      const shared = Object.keys(boostsA).filter((id) => id in boostsB).map((id) => CB_DATA.skills[id])

      const gap = Math.abs(gainA - gainB).toFixed(1)
      const [winner, loser] = gainA >= gainB ? [courseA, courseB] : [courseB, courseA]
      const sentences = [
        gap < 0.1
          ? `Both courses move you about the same distance towards ${career.name}.`
          : `${winner.name} moves you further towards ${career.name}, adding ${gap} more points than ${loser.name}.`,
        shared.length ? `They overlap on ${shared.join(' and ')}.` : 'They build different skills, so they work well together.',
      ]
      for (const course of [courseA, courseB]) {
        if (!isAvailable(course)) sentences.push(`You cannot take ${course.name} yet.`)
      }

      $('#comparison').innerHTML = `
        <section class="card">
          <h3>Summary</h3>
          <p class="rec-why">${sentences.join(' ')}</p>
        </section>

        <div class="card stats">
          <div class="stat"><strong>${Math.round(alignment(today))}%</strong><span>Today</span></div>
          <div class="stat"><strong>${Math.round(alignment(withA))}%</strong><span>With A</span></div>
          <div class="stat"><strong>${Math.round(alignment(withB))}%</strong><span>With B</span></div>
        </div>

        <section>
          <div class="section-head"><h2>Skill by skill</h2></div>
          <div class="card stack">
            ${skillIds
              .map(
                (id) => `
                <div>
                  <div class="skill-name">${CB_DATA.skills[id]} <span>Today ${today[id]}%</span></div>
                  <div class="compare-bar">A<div class="bar" style="--now:${withA[id]}%"></div>${withA[id]}%</div>
                  <div class="compare-bar">B<div class="bar b" style="--now:${withB[id]}%"></div>${withB[id]}%</div>
                </div>`,
              )
              .join('')}
          </div>
        </section>`
    }

    pickA.addEventListener('change', () => {
      a = pickA.value
      render()
    })
    pickB.addEventListener('change', () => {
      b = pickB.value
      render()
    })
    render()
  },

  plan() {
    const slider = $('#hours')

    const renderForecast = () => {
      const fit = workloadFit(totalHours(), student.weeklyHours)
      $('#hours-value').textContent = `${student.weeklyHours} h`
      $('#verdict').innerHTML = `<span class="status ${fit.tone}">${fit.label}</span><span>${fit.text}</span>`
    }

    const render = () => {
      const empty = student.planned.length === 0
      $('#plan-empty').hidden = !empty
      $('#plan-full').hidden = empty
      if (empty) return

      const now = Math.round(alignment(todayLevels()))
      const withPlan = Math.round(alignment(levelsWith(student.planned)))
      $('#fit-title').textContent = `${currentCareer().name} skills with this plan`
      $('#fit-next').textContent = `${withPlan}%`
      $('#fit-text').textContent = `Up from ${now}% today`
      const closedSemesters = new Set(
        [...$('#plan-list').querySelectorAll('details:not([open])')].map((section) => Number(section.dataset.semester)),
      )
      const plannedCourses = student.planned.map(courseById).filter(Boolean)
      const semesters = [...new Set(plannedCourses.map((course) => course.semester))].sort((a, b) => a - b)
      $('#plan-list').innerHTML = semesters.map((semester) => {
        const courses = plannedCourses.filter((course) => course.semester === semester)
        const rows = courses.map((course) => `
          <li>
            <a href="${courseUrl(course.id)}"><strong>${course.name}</strong><span class="meta">${guideLine(course)} · ${hoursText(weeklyHours(course))}/wk</span></a>
            <button class="remove" type="button" data-remove="${course.id}" aria-label="Remove ${course.name} from plan"></button>
          </li>`).join('')
        return `<details class="card path-semester" data-semester="${semester}" ${closedSemesters.has(semester) ? '' : 'open'}>
          <summary><span><strong>Semester ${semester}</strong><span class="path-semester-count">${courses.length} planned ${courses.length === 1 ? 'course' : 'courses'}</span></span><span class="path-chevron" aria-hidden="true"></span></summary>
          <ul class="rows">${rows}</ul>
        </details>`
      }).join('')
      $('#total-hours').textContent = hoursText(totalHours())
      renderForecast()
    }

    $('#plan-list').addEventListener('click', (event) => {
      const id = event.target.dataset.remove
      if (!id) return
      togglePlanned(id)
      render()
    })
    slider.value = student.weeklyHours
    slider.addEventListener('input', () => {
      student.weeklyHours = Number(slider.value)
      saveStudent()
      renderForecast()
    })
    render()
  },
}

pages[document.body.dataset.page]?.()
