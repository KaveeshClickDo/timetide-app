import { NextResponse } from 'next/server'
import { planConfigToTier } from '@/lib/pricing'
import { getAllPlans } from '@/lib/pricing-server'

/** GET - Public endpoint: return all active plans for display */
export async function GET() {
  try {
    const plans = await getAllPlans()

    const publicPlans = plans.map((config) => ({
      ...planConfigToTier(config),
      limits: config.limits,
    }))

    return NextResponse.json(publicPlans)
  } catch (error) {
    console.error('Failed to fetch plans:', error)
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 })
  }
}
