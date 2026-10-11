/**
 * Admin CLI Tool for Servants Prep App
 *
 * Usage: bun scripts/admin.ts <command> [options]
 *
 * Commands:
 *   reset-password <email>     Reset a user's password to a new secure random password
 *   create-admin <email>       Create a new SUPER_ADMIN user
 *   list-admins                List all admin users (SUPER_ADMIN, PRIEST, SERVANT_PREP)
 *   list-sections              List all exam sections
 *   db-stats                   Show database statistics
 *   mcp-token-create <email> <name> | mcp-token-list | mcp-token-revoke <id>
 *                              Manage feedback MCP API tokens
 *   migrate-academic-years     Migrate existing enrollments to active academic year
 */

import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient({
  datasourceUrl: process.env.SP_DATABASE_URL_UNPOOLED || process.env.SP_DATABASE_URL
})

// Generate a secure random password
function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*_+-='
  const allChars = uppercase + lowercase + numbers + symbols

  let password = ''
  password += uppercase[crypto.randomInt(0, uppercase.length)]
  password += lowercase[crypto.randomInt(0, lowercase.length)]
  password += numbers[crypto.randomInt(0, numbers.length)]
  password += symbols[crypto.randomInt(0, symbols.length)]

  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)]
  }

  return password.split('').sort(() => crypto.randomInt(-1, 2)).join('')
}

async function resetPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    console.error(`❌ User with email "${email}" not found`)
    process.exit(1)
  }

  const newPassword = generateSecurePassword(20)
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
      authVersion: { increment: 1 },
    }
  })

  console.log('\n✅ Password reset successfully!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📧 Email:    ${email}`)
  console.log(`👤 Name:     ${user.name}`)
  console.log(`🔑 Password: ${newPassword}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n⚠️  Save this password securely!\n')
}

async function createAdmin(email: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    console.error(`❌ User with email "${email}" already exists`)
    process.exit(1)
  }

  const newPassword = generateSecurePassword(20)
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  const user = await prisma.user.create({
    data: {
      email,
      name: name || 'Administrator',
      password: hashedPassword,
      role: UserRole.SUPER_ADMIN,
      mustChangePassword: false
    }
  })

  console.log('\n✅ Super Admin created successfully!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📧 Email:    ${email}`)
  console.log(`👤 Name:     ${user.name}`)
  console.log(`🔑 Password: ${newPassword}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n⚠️  Save this password securely!\n')
}

async function listAdmins() {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: [UserRole.SUPER_ADMIN, UserRole.PRIEST, UserRole.SERVANT_PREP] }
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { role: 'asc' }
  })

  console.log('\n📋 Admin Users:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (admins.length === 0) {
    console.log('  No admin users found.')
  } else {
    admins.forEach((admin, i) => {
      console.log(`  ${i + 1}. ${admin.name}`)
      console.log(`     Email: ${admin.email}`)
      console.log(`     Role:  ${admin.role}`)
      console.log(`     Created: ${admin.createdAt.toLocaleDateString()}`)
      console.log('')
    })
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function listSections() {
  const sections = await prisma.examSection.findMany({
    orderBy: { name: 'asc' }
  })

  console.log('\n📚 Exam Sections:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (sections.length === 0) {
    console.log('  No exam sections found. Run `bun db:seed` to create them.')
  } else {
    sections.forEach((section, i) => {
      console.log(`  ${i + 1}. ${section.displayName}`)
      console.log(`     Name: ${section.name}`)
      console.log(`     Passing Score: ${section.passingScore}%`)
      console.log(`     Average Requirement: ${section.averageRequirement}%`)
      console.log('')
    })
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function dbStats() {
  const [
    userCount,
    studentCount,
    mentorCount,
    adminCount,
    enrollmentCount,
    lessonCount,
    examCount,
    attendanceCount,
    sectionCount,
    academicYearCount
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: UserRole.STUDENT } }),
    prisma.user.count({ where: { role: UserRole.MENTOR } }),
    prisma.user.count({ where: { role: { in: [UserRole.SUPER_ADMIN, UserRole.PRIEST, UserRole.SERVANT_PREP] } } }),
    prisma.studentEnrollment.count(),
    prisma.lesson.count(),
    prisma.exam.count(),
    prisma.attendanceRecord.count(),
    prisma.examSection.count(),
    prisma.academicYear.count()
  ])

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } })

  console.log('\n📊 Database Statistics:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Users:             ${userCount}`)
  console.log(`    - Students:      ${studentCount}`)
  console.log(`    - Mentors:       ${mentorCount}`)
  console.log(`    - Admins:        ${adminCount}`)
  console.log('')
  console.log(`  Enrollments:       ${enrollmentCount}`)
  console.log(`  Lessons:           ${lessonCount}`)
  console.log(`  Exams:             ${examCount}`)
  console.log(`  Attendance Records: ${attendanceCount}`)
  console.log(`  Exam Sections:     ${sectionCount}`)
  console.log(`  Academic Years:    ${academicYearCount}`)
  console.log('')
  console.log(`  Active Year:       ${activeYear?.name || 'None'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function migrateEnrollmentsToAcademicYear() {
  // Get all academic years sorted by start date
  const academicYears = await prisma.academicYear.findMany({
    orderBy: { startDate: 'desc' }
  })

  if (academicYears.length === 0) {
    console.error('❌ No academic years found. Please create them first.')
    process.exit(1)
  }

  const activeYear = academicYears.find(y => y.isActive)
  if (!activeYear) {
    console.error('❌ No active academic year found. Please set one as active.')
    process.exit(1)
  }

  // Find the previous academic year (for Year 2 students who started last year)
  const activeYearIndex = academicYears.findIndex(y => y.id === activeYear.id)
  const previousYear = academicYears[activeYearIndex + 1] // Previous year (older)

  console.log('\n📅 Academic Year Migration')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Active Year:   ${activeYear.name}`)
  console.log(`  Previous Year: ${previousYear?.name || 'Not found'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Year 1 students: enrolled in the current active year
  const year1Result = await prisma.studentEnrollment.updateMany({
    where: {
      yearLevel: 'YEAR_1',
      status: 'ACTIVE'
    },
    data: { academicYearId: activeYear.id }
  })
  console.log(`✅ Year 1 students: ${year1Result.count} enrollment(s) set to "${activeYear.name}"`)

  // Year 2 students: enrolled in the previous year (they started last year)
  if (previousYear) {
    const year2Result = await prisma.studentEnrollment.updateMany({
      where: {
        yearLevel: 'YEAR_2',
        status: 'ACTIVE'
      },
      data: { academicYearId: previousYear.id }
    })
    console.log(`✅ Year 2 students: ${year2Result.count} enrollment(s) set to "${previousYear.name}"`)
  } else {
    console.log('⚠️  No previous academic year found - Year 2 students not updated')
    console.log('   Create a previous year (e.g., 2023-2024) and run this command again')
  }

  // Graduated students: graduation year is when they graduated (active year if not set)
  const graduatedResult = await prisma.studentEnrollment.updateMany({
    where: {
      status: 'GRADUATED',
      graduatedAcademicYearId: null
    },
    data: { graduatedAcademicYearId: activeYear.id }
  })
  console.log(`✅ Graduated students: ${graduatedResult.count} enrollment(s) graduation year set to "${activeYear.name}"`)

  console.log('\n📋 Summary:')
  console.log('   - Year 1 (Active) students enrolled in the current active year')
  console.log('   - Year 2 (Active) students enrolled in the previous year')
  console.log('   - Graduated students have graduation year set to active year\n')
}

async function listAcademicYears() {
  const years = await prisma.academicYear.findMany({
    orderBy: { startDate: 'desc' }
  })

  console.log('\n📅 Academic Years:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (years.length === 0) {
    console.log('  No academic years found. Create one with:')
    console.log('  bun scripts/admin.ts create-academic-year "2024-2025" 2024-09-01 2025-06-30')
  } else {
    for (const year of years) {
      const activeMarker = year.isActive ? ' (ACTIVE)' : ''
      // Count enrollments for this year
      const enrollments = await prisma.studentEnrollment.count({
        where: { academicYearId: year.id }
      })
      const graduated = await prisma.studentEnrollment.count({
        where: { graduatedAcademicYearId: year.id }
      })
      console.log(`  ${year.name}${activeMarker}`)
      console.log(`     Start: ${year.startDate.toLocaleDateString()}`)
      console.log(`     End:   ${year.endDate.toLocaleDateString()}`)
      console.log(`     Enrollments: ${enrollments} | Graduated: ${graduated}`)
      console.log('')
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function createAcademicYear(name: string, startDate: string, endDate: string, setActive: boolean = false) {
  // Check if year with this name already exists
  const existing = await prisma.academicYear.findUnique({ where: { name } })
  if (existing) {
    console.error(`❌ Academic year "${name}" already exists`)
    process.exit(1)
  }

  // Parse dates
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('❌ Invalid date format. Use YYYY-MM-DD format (e.g., 2024-09-01)')
    process.exit(1)
  }

  if (start >= end) {
    console.error('❌ Start date must be before end date')
    process.exit(1)
  }

  // If setting as active, deactivate all others
  if (setActive) {
    await prisma.academicYear.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    })
  }

  const year = await prisma.academicYear.create({
    data: {
      name,
      startDate: start,
      endDate: end,
      isActive: setActive
    }
  })

  console.log('\n✅ Academic year created successfully!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  Name:   ${year.name}`)
  console.log(`  Start:  ${year.startDate.toLocaleDateString()}`)
  console.log(`  End:    ${year.endDate.toLocaleDateString()}`)
  console.log(`  Active: ${year.isActive ? 'Yes' : 'No'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

async function setActiveAcademicYear(name: string) {
  const year = await prisma.academicYear.findUnique({ where: { name } })
  if (!year) {
    console.error(`❌ Academic year "${name}" not found`)
    process.exit(1)
  }

  // Deactivate all others
  await prisma.academicYear.updateMany({
    where: { isActive: true },
    data: { isActive: false }
  })

  // Activate the specified year
  await prisma.academicYear.update({
    where: { id: year.id },
    data: { isActive: true }
  })

  console.log(`\n✅ Academic year "${name}" is now active!\n`)
}

// MCP tokens: keep the format in sync with lib/mcp-tokens.ts (this script avoids
// the "@/" alias so it runs standalone).
async function createMcpToken(email: string, name: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`❌ User with email "${email}" not found`)
    process.exit(1)
  }
  if (user.role !== UserRole.SUPER_ADMIN) {
    console.error('❌ MCP tokens can only be issued to SUPER_ADMIN users')
    process.exit(1)
  }
  const token = `smk_mcp_${crypto.randomBytes(32).toString('base64url')}`
  const record = await prisma.mcpApiToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      tokenPrefix: token.slice(0, 14),
    },
  })
  console.log('\n✅ MCP token created (shown once — store it now)\n')
  console.log(`   Id:    ${record.id}`)
  console.log(`   Owner: ${user.email}`)
  console.log(`   Name:  ${name}`)
  console.log(`   Token: ${token}\n`)
}

async function listMcpTokens() {
  const tokens = await prisma.mcpApiToken.findMany({
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { email: true } } },
  })
  if (tokens.length === 0) return console.log('No MCP tokens.')
  for (const t of tokens) {
    const state = t.revokedAt ? 'REVOKED' : t.expiresAt && t.expiresAt < new Date() ? 'EXPIRED' : 'active'
    console.log(
      `${t.id}  ${t.tokenPrefix}…  ${state.padEnd(7)}  ${t.user.email}  "${t.name}"  last used: ${t.lastUsedAt?.toISOString() ?? 'never'}`
    )
  }
}

async function revokeMcpToken(id: string) {
  const result = await prisma.mcpApiToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (result.count === 0) {
    console.error('❌ No active token with that id')
    process.exit(1)
  }
  console.log('✅ Token revoked')
}

function showHelp() {
  console.log(`
Admin CLI Tool for Servants Prep App

Usage: bun scripts/admin.ts <command> [options]

Commands:
  reset-password <email>       Reset a user's password to a new secure random password
  create-admin <email> [name]  Create a new SUPER_ADMIN user
  list-admins                  List all admin users (SUPER_ADMIN, PRIEST, SERVANT_PREP)
  list-sections                List all exam sections
  db-stats                     Show database statistics

  Feedback MCP Commands:
  mcp-token-create <email> <name>  Issue an MCP API token to a SUPER_ADMIN
  mcp-token-list               List MCP tokens
  mcp-token-revoke <id>        Revoke an MCP token

  Academic Year Commands:
  list-years                   List all academic years
  create-year <name> <start> <end> [--active]  Create a new academic year
  set-active-year <name>       Set an academic year as active
  migrate-academic-years       Migrate enrollments to academic years based on year level
  help                         Show this help message

Examples:
  bun scripts/admin.ts reset-password user@example.com
  bun scripts/admin.ts create-admin newadmin@church.com "Fr. John"
  bun scripts/admin.ts list-admins
  bun scripts/admin.ts db-stats

  # Academic year examples:
  bun scripts/admin.ts list-years
  bun scripts/admin.ts create-year "2023-2024" 2023-09-01 2024-06-30
  bun scripts/admin.ts create-year "2024-2025" 2024-09-01 2025-06-30 --active
  bun scripts/admin.ts set-active-year "2024-2025"
  bun scripts/admin.ts migrate-academic-years
`)
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp()
    return
  }

  console.log('🔌 Connecting to database...')
  await prisma.$connect()
  console.log('✅ Connected!\n')

  switch (command) {
    case 'reset-password':
      if (!args[1]) {
        console.error('❌ Email is required. Usage: bun scripts/admin.ts reset-password <email>')
        process.exit(1)
      }
      await resetPassword(args[1])
      break

    case 'create-admin':
      if (!args[1]) {
        console.error('❌ Email is required. Usage: bun scripts/admin.ts create-admin <email> [name]')
        process.exit(1)
      }
      await createAdmin(args[1], args[2])
      break

    case 'list-admins':
      await listAdmins()
      break

    case 'list-sections':
      await listSections()
      break

    case 'db-stats':
      await dbStats()
      break

    case 'migrate-academic-years':
      await migrateEnrollmentsToAcademicYear()
      break

    case 'mcp-token-create':
      if (!args[1] || !args[2]) {
        console.error('❌ Usage: bun scripts/admin.ts mcp-token-create <email> <name>')
        process.exit(1)
      }
      await createMcpToken(args[1], args[2])
      break

    case 'mcp-token-list':
      await listMcpTokens()
      break

    case 'mcp-token-revoke':
      if (!args[1]) {
        console.error('❌ Usage: bun scripts/admin.ts mcp-token-revoke <id>')
        process.exit(1)
      }
      await revokeMcpToken(args[1])
      break

    case 'list-years':
      await listAcademicYears()
      break

    case 'create-year':
      if (!args[1] || !args[2] || !args[3]) {
        console.error('❌ Usage: bun scripts/admin.ts create-year <name> <start-date> <end-date> [--active]')
        console.error('   Example: bun scripts/admin.ts create-year "2023-2024" 2023-09-01 2024-06-30')
        process.exit(1)
      }
      const setActive = args.includes('--active')
      await createAcademicYear(args[1], args[2], args[3], setActive)
      break

    case 'set-active-year':
      if (!args[1]) {
        console.error('❌ Usage: bun scripts/admin.ts set-active-year <name>')
        console.error('   Example: bun scripts/admin.ts set-active-year "2024-2025"')
        process.exit(1)
      }
      await setActiveAcademicYear(args[1])
      break

    default:
      console.error(`❌ Unknown command: ${command}`)
      showHelp()
      process.exit(1)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('❌ Error:', e.message || e)
    await prisma.$disconnect()
    process.exit(1)
  })
