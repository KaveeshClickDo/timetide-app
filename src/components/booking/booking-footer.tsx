'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function BookingFooter() {
  return (
    <div className="text-center mt-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <Image
          src="/logo.svg"
          alt="TimeTide"
          width={20}
          height={20}
        />
        TimeTide Powered by SeekaHost Technologies Ltd.
      </Link>
    </div>
  )
}
