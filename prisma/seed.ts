import {
  AttendanceStatus,
  PrismaClient,
  SundaySchoolServantAttendanceStatus,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function getFirstSundayAfterSeptember11(year: number) {
  const september11 = new Date(Date.UTC(year, 8, 11))
  const daysUntilSunday = (7 - september11.getUTCDay()) % 7 || 7

  return new Date(Date.UTC(year, 8, 11 + daysUntilSunday))
}

async function main() {
  console.log('Starting seed...')

  // Create exam sections
  console.log('Creating exam sections...')
  const examSections = await Promise.all([
    prisma.examSection.upsert({
      where: { name: 'BIBLE_STUDIES' },
      update: { displayName: 'Bible Studies' },
      create: {
        name: 'BIBLE_STUDIES',
        displayName: 'Bible Studies',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'DOGMA' },
      update: { displayName: 'Dogma' },
      create: {
        name: 'DOGMA',
        displayName: 'Dogma',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'COMPARATIVE_THEOLOGY' },
      update: { displayName: 'Comparative Theology' },
      create: {
        name: 'COMPARATIVE_THEOLOGY',
        displayName: 'Comparative Theology',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'RITUAL_THEOLOGY_SACRAMENTS' },
      update: { displayName: 'Ritual Theology & Sacraments' },
      create: {
        name: 'RITUAL_THEOLOGY_SACRAMENTS',
        displayName: 'Ritual Theology & Sacraments',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'CHURCH_HISTORY_COPTIC_HERITAGE' },
      update: { displayName: 'Church History & Coptic Heritage' },
      create: {
        name: 'CHURCH_HISTORY_COPTIC_HERITAGE',
        displayName: 'Church History & Coptic Heritage',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'SPIRITUALITY_OF_SERVANT' },
      update: { displayName: 'Spirituality of the Servant' },
      create: {
        name: 'SPIRITUALITY_OF_SERVANT',
        displayName: 'Spirituality of the Servant',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'PSYCHOLOGY_METHODOLOGY' },
      update: { displayName: 'Psychology & Methodology' },
      create: {
        name: 'PSYCHOLOGY_METHODOLOGY',
        displayName: 'Psychology & Methodology',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
    prisma.examSection.upsert({
      where: { name: 'MISCELLANEOUS' },
      update: { displayName: 'Miscellaneous' },
      create: {
        name: 'MISCELLANEOUS',
        displayName: 'Miscellaneous',
        passingScore: 60,
        averageRequirement: 75,
      },
    }),
  ])

  console.log('Exam sections created:', examSections.length)

  // Create users
  console.log('Creating users...')
  const hashedPassword = await bcrypt.hash('password123', 10)

  const priest = await prisma.user.upsert({
    where: { email: 'priest@church.com' },
    update: {},
    create: {
      email: 'priest@church.com',
      name: 'Fr. Michael',
      password: hashedPassword,
      role: 'PRIEST',
    },
  })

  const mentor1 = await prisma.user.upsert({
    where: { email: 'mentor1@church.com' },
    update: {},
    create: {
      email: 'mentor1@church.com',
      name: 'Abouna Peter',
      password: hashedPassword,
      role: 'MENTOR',
    },
  })

  const mentor2 = await prisma.user.upsert({
    where: { email: 'mentor2@church.com' },
    update: {},
    create: {
      email: 'mentor2@church.com',
      name: 'Abouna John',
      password: hashedPassword,
      role: 'MENTOR',
    },
  })

  const student1 = await prisma.user.upsert({
    where: { email: 'student1@church.com' },
    update: {},
    create: {
      email: 'student1@church.com',
      name: 'John Smith',
      password: hashedPassword,
      role: 'STUDENT',
    },
  })

  const student2 = await prisma.user.upsert({
    where: { email: 'student2@church.com' },
    update: {},
    create: {
      email: 'student2@church.com',
      name: 'Mary Jones',
      password: hashedPassword,
      role: 'STUDENT',
    },
  })

  const student3 = await prisma.user.upsert({
    where: { email: 'student3@church.com' },
    update: {},
    create: {
      email: 'student3@church.com',
      name: 'Peter David',
      password: hashedPassword,
      role: 'STUDENT',
    },
  })

  console.log('Users created')

  // Create academic year
  console.log('Creating academic year...')
  await prisma.academicYear.updateMany({
    where: { isActive: true, name: { not: '2026-2027' } },
    data: { isActive: false },
  })
  const academicYear = await prisma.academicYear.upsert({
    where: { name: '2026-2027' },
    update: {
      startDate: new Date('2026-09-11'),
      endDate: new Date('2027-09-10'),
      isActive: true,
    },
    create: {
      name: '2026-2027',
      startDate: new Date('2026-09-11'),
      endDate: new Date('2027-09-10'),
      isActive: true,
    },
  })

  console.log('Academic year created:', academicYear.name)

  // Create enrollments
  console.log('Creating enrollments...')
  await prisma.studentEnrollment.upsert({
    where: {
      studentId: student1.id,
    },
    update: {},
    create: {
      studentId: student1.id,
      yearLevel: 'YEAR_1',
      mentorId: mentor1.id,
      isActive: true,
    },
  })

  await prisma.studentEnrollment.upsert({
    where: {
      studentId: student2.id,
    },
    update: {},
    create: {
      studentId: student2.id,
      yearLevel: 'YEAR_2',
      mentorId: mentor1.id,
      isActive: true,
    },
  })

  await prisma.studentEnrollment.upsert({
    where: {
      studentId: student3.id,
    },
    update: {},
    create: {
      studentId: student3.id,
      yearLevel: 'YEAR_1',
      mentorId: mentor2.id,
      isActive: true,
    },
  })

  console.log('Enrollments created')

  // Create sample lessons
  console.log('Creating sample lessons...')
  const bibleSection = examSections.find(s => s.name === 'BIBLE_STUDIES')!

  const lessons = [
    {
      title: 'Creation Story - Genesis 1',
      description: 'Study of the creation account in Genesis chapter 1',
      scheduledDate: new Date('2024-09-06T19:00:00'),
      lessonNumber: 1,
    },
    {
      title: 'The Fall - Genesis 3',
      description: 'Understanding the fall of man and its consequences',
      scheduledDate: new Date('2024-09-13T19:00:00'),
      lessonNumber: 2,
    },
    {
      title: 'Noah\'s Ark - Genesis 6-9',
      description: 'The story of Noah and the great flood',
      scheduledDate: new Date('2024-09-20T19:00:00'),
      lessonNumber: 3,
    },
  ]

  for (const lesson of lessons) {
    await prisma.lesson.upsert({
      where: {
        academicYearId_lessonNumber: {
          academicYearId: academicYear.id,
          lessonNumber: lesson.lessonNumber,
        },
      },
      update: {},
      create: {
        ...lesson,
        academicYearId: academicYear.id,
        examSectionId: bibleSection.id,
        createdBy: priest.id,
        status: 'COMPLETED',
      },
    })
  }

  // Sunday School mode: the age-group bands, a class, its servants, children
  console.log('Creating Sunday School sample data...')

  // Bands are data, not an enum, so this is a starting point the church can
  // redraw. A grade belongs to exactly one band.
  const ageGroupSeeds = [
    {
      name: 'Elementary',
      sortOrder: 0,
      levels: ['PRE_K', 'KINDERGARTEN', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'SPECIAL_NEEDS'] as const,
    },
    { name: 'Middle School', sortOrder: 1, levels: ['GRADE_6', 'GRADE_7', 'GRADE_8'] as const },
    {
      name: 'High School',
      sortOrder: 2,
      levels: ['GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12'] as const,
    },
  ]

  for (const group of ageGroupSeeds) {
    const existing = await prisma.sundaySchoolAgeGroup.findFirst({
      where: { name: group.name, sundaySchoolYearId: null },
      select: { id: true },
    })
    if (existing) {
      await prisma.sundaySchoolAgeGroup.update({
        where: { id: existing.id },
        data: { sortOrder: group.sortOrder, levels: [...group.levels] },
      })
    } else {
      await prisma.sundaySchoolAgeGroup.create({
        data: { name: group.name, sortOrder: group.sortOrder, levels: [...group.levels] },
      })
    }
  }

  const elementary = await prisma.sundaySchoolAgeGroup.findFirstOrThrow({
    where: { name: 'Elementary', sundaySchoolYearId: null },
  })

  const servant = await prisma.user.upsert({
    where: { email: 'servant@church.com' },
    update: {},
    create: {
      email: 'servant@church.com',
      name: 'Marina Fahmy',
      password: hashedPassword,
      role: 'SERVANT',
    },
  })

  // Coordinates the whole Elementary band: every elementary class, plus the
  // power to open and close classes within it.
  const elementaryCoordinator = await prisma.user.upsert({
    where: { email: 'elementary.coordinator@church.com' },
    update: {},
    create: {
      email: 'elementary.coordinator@church.com',
      name: 'Sandra Wahba',
      password: hashedPassword,
      role: 'SERVANT',
    },
  })

  const sundaySchoolClass = await prisma.sundaySchoolClass.upsert({
    where: {
      name_academicYearId: {
        name: 'Grade 3 Boys',
        academicYearId: academicYear.id,
      },
    },
    update: {},
    create: {
      name: 'Grade 3 Boys',
      level: 'GRADE_3',
      academicYearId: academicYear.id,
    },
  })

  const assignmentSeeds = [
    { userId: servant.id, classId: sundaySchoolClass.id, ageGroupId: null, authority: 'SERVANT' as const },
    { userId: elementaryCoordinator.id, classId: null, ageGroupId: elementary.id, authority: 'COORDINATOR' as const },
    // Age-group coordination grants Sandra permission to record attendance;
    // this direct class assignment also makes her part of this class's roster.
    { userId: elementaryCoordinator.id, classId: sundaySchoolClass.id, ageGroupId: null, authority: 'COORDINATOR' as const },
  ]

  for (const assignment of assignmentSeeds) {
    const existing = await prisma.sundaySchoolServantAssignment.findFirst({
      where: {
        userId: assignment.userId,
        academicYearId: academicYear.id,
        classId: assignment.classId,
        ageGroupId: assignment.ageGroupId,
      },
    })
    if (!existing) {
      await prisma.sundaySchoolServantAssignment.create({
        data: { ...assignment, academicYearId: academicYear.id },
      })
    }
  }

  const girgisFamily = await prisma.sundaySchoolFamily.upsert({
    where: { id: 'seed-girgis-family' },
    update: {
      name: 'Girgis Family',
      homeAddress: '125 St. Mark Way, Jersey City, NJ 07306',
      motherName: 'Mariam Girgis',
      motherPhone: '555-0191',
      motherEmail: 'mariam.girgis@example.com',
      fatherName: 'Nader Girgis',
      fatherPhone: '555-0101',
      fatherEmail: 'nader.girgis@example.com',
    },
    create: {
      id: 'seed-girgis-family',
      name: 'Girgis Family',
      homeAddress: '125 St. Mark Way, Jersey City, NJ 07306',
      motherName: 'Mariam Girgis',
      motherPhone: '555-0191',
      motherEmail: 'mariam.girgis@example.com',
      fatherName: 'Nader Girgis',
      fatherPhone: '555-0101',
      fatherEmail: 'nader.girgis@example.com',
    },
  })

  const sampleChildren = [
    {
      firstName: 'Mina',
      lastName: 'Girgis',
      guardianName: 'Nader Girgis',
      guardianPhone: '555-0101',
    },
    { firstName: 'Joseph', lastName: 'Girgis', guardianName: 'Nader Girgis', guardianPhone: '555-0101' },
    { firstName: 'Kirollos', lastName: 'Samir', guardianName: 'Hoda Samir', guardianPhone: '555-0102' },
    { firstName: 'Youssef', lastName: 'Adel', guardianName: 'Adel Fawzy', guardianPhone: '555-0103' },
    { firstName: 'Mark', lastName: 'Botros', guardianName: 'Mariam Botros', guardianPhone: '555-0104' },
    { firstName: 'Andrew', lastName: 'Mikhail', guardianName: 'George Mikhail', guardianPhone: '555-0105' },
    { firstName: 'David', lastName: 'Naguib', guardianName: 'Nancy Naguib', guardianPhone: '555-0106' },
    { firstName: 'Matthew', lastName: 'Hanna', guardianName: 'Mona Hanna', guardianPhone: '555-0107' },
    { firstName: 'Peter', lastName: 'Fawzy', guardianName: 'Samia Fawzy', guardianPhone: '555-0108' },
    { firstName: 'John', lastName: 'Salib', guardianName: 'Maged Salib', guardianPhone: '555-0109' },
    { firstName: 'Daniel', lastName: 'Yacoub', guardianName: 'Dina Yacoub', guardianPhone: '555-0110' },
  ]

  const children = []
  for (const child of sampleChildren) {
    let savedChild = await prisma.sundaySchoolChild.findFirst({
      where: {
        firstName: child.firstName,
        lastName: child.lastName,
        classId: sundaySchoolClass.id,
      },
    })
    if (!savedChild) {
      savedChild = await prisma.sundaySchoolChild.create({
        data: {
          ...child,
          level: 'GRADE_3',
          classId: sundaySchoolClass.id,
          familyId: child.lastName === 'Girgis' ? girgisFamily.id : null,
        },
      })
    } else if (child.lastName === 'Girgis' && savedChild.familyId !== girgisFamily.id) {
      savedChild = await prisma.sundaySchoolChild.update({
        where: { id: savedChild.id },
        data: { familyId: girgisFamily.id },
      })
    }
    children.push(savedChild)
  }

  // A deterministic attendance history gives the dashboard chart enough data
  // to show weekly movement while keeping repeated seed runs idempotent. The
  // saved attendance snapshots intentionally grow as children join the class.
  const topics = [
    'God Creates the World',
    'Noah Trusts God',
    'Abraham and the Promise',
    'Joseph Forgives His Brothers',
    'Moses and the Burning Bush',
    'The Ten Commandments',
    'David and Goliath',
    'Daniel in the Lions\' Den',
    'The Birth of Jesus',
    'Jesus Calms the Storm',
    'The Good Samaritan',
    'The Prodigal Son',
  ]
  const firstSunday = getFirstSundayAfterSeptember11(academicYear.startDate.getUTCFullYear())
  const skippedWeeks = new Set([13, 27])
  const servantAttendanceSkippedWeeks = new Set([5, 18])

  for (let week = 0; week < 38; week += 1) {
    if (skippedWeeks.has(week)) continue

    const date = new Date(firstSunday)
    date.setUTCDate(date.getUTCDate() + week * 7)

    const session = await prisma.sundaySchoolSession.upsert({
      where: {
        classId_date: {
          classId: sundaySchoolClass.id,
          date,
        },
      },
      update: {
        topic: topics[week % topics.length],
        takenBy: servant.id,
      },
      create: {
        classId: sundaySchoolClass.id,
        date,
        topic: topics[week % topics.length],
        takenBy: servant.id,
      },
    })

    const rosterSize = week < 8 ? 7 : week < 20 ? 9 : children.length
    for (const [childIndex, child] of children.slice(0, rosterSize).entries()) {
      const attendanceKey = (week * 7 + childIndex * 3) % 17
      let status: AttendanceStatus = AttendanceStatus.PRESENT

      if (attendanceKey === 0) status = AttendanceStatus.EXCUSED
      else if ((week + childIndex * 2) % 9 === 0) status = AttendanceStatus.ABSENT
      else if ((week * 2 + childIndex) % 8 === 0) status = AttendanceStatus.LATE

      await prisma.sundaySchoolChildAttendance.upsert({
        where: {
          sessionId_childId: {
            sessionId: session.id,
            childId: child.id,
          },
        },
        update: { status, recordedBy: servant.id },
        create: {
          sessionId: session.id,
          childId: child.id,
          status,
          recordedBy: servant.id,
        },
      })
    }

    if (!servantAttendanceSkippedWeeks.has(week)) {
      const servantMarks = [
        {
          servantId: servant.id,
          status: week % 10 === 0
            ? SundaySchoolServantAttendanceStatus.ABSENT
            : SundaySchoolServantAttendanceStatus.PRESENT,
        },
        {
          servantId: elementaryCoordinator.id,
          status: week % 13 === 0
            ? SundaySchoolServantAttendanceStatus.ABSENT
            : SundaySchoolServantAttendanceStatus.PRESENT,
        },
      ]

      for (const mark of servantMarks) {
        await prisma.sundaySchoolServantAttendance.upsert({
          where: {
            sessionId_servantId: {
              sessionId: session.id,
              servantId: mark.servantId,
            },
          },
          update: { status: mark.status, recordedBy: elementaryCoordinator.id },
          create: {
            sessionId: session.id,
            servantId: mark.servantId,
            status: mark.status,
            recordedBy: elementaryCoordinator.id,
          },
        })
      }
    }
  }

  console.log(`Sunday School sample data created: ${children.length} children, 2 servants, and weekly attendance`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
