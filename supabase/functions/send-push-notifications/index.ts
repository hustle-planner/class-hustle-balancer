import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('DB_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('DB_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL')!

webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const today = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('id, name, deadline, status')
    .in('deadline', [today, tomorrow])
    .neq('status', 'done')

  if (tasksError) {
    console.error('Failed to fetch tasks:', tasksError.message)
    return new Response('Error fetching tasks', { status: 500 })
  }

  if (!tasks || tasks.length === 0) {
    console.log('No urgent tasks found for today or tomorrow')
    return new Response('No urgent tasks', { status: 200 })
  }

  const dueToday = tasks.filter(t => t.deadline === today && t.status !== 'scheduled')
  const dueTomorrow = tasks.filter(t => t.deadline === tomorrow && t.status !== 'scheduled')

  let title = 'Hustle Planner ⏰'
  let body = ''

  if (dueToday.length > 0) {
    body += `Due today: ${dueToday.map(t => t.name).join(', ')}. `
  }
  if (dueTomorrow.length > 0) {
    body += `Due tomorrow: ${dueTomorrow.map(t => t.name).join(', ')}.`
  }

  body = body.trim()

  if (!body) {
    console.log('All urgent tasks are already scheduled or done')
    return new Response('Nothing to notify', { status: 200 })
  }

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')

  if (subsError) {
    console.error('Failed to fetch subscriptions:', subsError.message)
    return new Response('Error fetching subscriptions', { status: 500 })
  }

  if (!subs || subs.length === 0) {
    console.log('No push subscriptions found')
    return new Response('No subscribers', { status: 200 })
  }

  const payload = JSON.stringify({ title, body, tag: 'daily-briefing' })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        payload
      )
    )
  )

  const sent = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.warn(`Failed to send to subscription ${i}:`, (result as PromiseRejectedResult).reason?.message)
    }
  })

  console.log(`Push notifications sent: ${sent} succeeded, ${failed} failed`)

  return new Response(
    JSON.stringify({ sent, failed, tasksFound: tasks.length }),
    { headers: { 'Content-Type': 'application/json' }, status: 200 }
  )
})
