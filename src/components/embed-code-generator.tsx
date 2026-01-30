'use client'

import { useState } from 'react'
import { Copy, Check, Code, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'

interface EmbedCodeGeneratorProps {
  username: string
  eventSlug: string
  eventTitle: string
}

export function EmbedCodeGenerator({
  username,
  eventSlug,
  eventTitle,
}: EmbedCodeGeneratorProps) {
  const { toast } = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const [width, setWidth] = useState('100%')
  const [height, setHeight] = useState('700')

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const bookingUrl = `${baseUrl}/${username}/${eventSlug}`

  const iframeCode = `<iframe
  src="${bookingUrl}?embed=true"
  width="${width}"
  height="${height}px"
  frameborder="0"
  style="border: none; min-width: 320px;"
  allow="payment"
  loading="lazy"
></iframe>`

  const popupCode = `<script>
  function openTimeTideBooking() {
    window.open(
      '${bookingUrl}',
      'TimeTide Booking',
      'width=600,height=700,scrollbars=yes'
    );
  }
</script>
<button onclick="openTimeTideBooking()">
  Book a Meeting
</button>`

  const linkCode = `<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer">
  Book a Meeting - ${eventTitle}
</a>`

  const reactCode = `import { useState } from 'react';

function BookingWidget() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Book a Meeting
      </button>
      {isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            width: '90%',
            maxWidth: '600px',
            height: '80%',
            position: 'relative'
          }}>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 1
              }}
            >
              Close
            </button>
            <iframe
              src="${bookingUrl}?embed=true"
              width="100%"
              height="100%"
              frameBorder="0"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      )}
    </>
  );
}`

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      toast({
        title: 'Copied!',
        description: 'Code copied to clipboard',
      })
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Code className="h-4 w-4 mr-2" />
          Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Embed Booking Widget</DialogTitle>
          <DialogDescription>
            Add your booking page to any website. Choose your preferred embed method.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preview Link */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-600 flex-1 truncate">
              {bookingUrl}
            </span>
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ocean-600 hover:text-ocean-700"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <Tabs defaultValue="iframe" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="iframe">Inline</TabsTrigger>
              <TabsTrigger value="popup">Popup</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
              <TabsTrigger value="react">React</TabsTrigger>
            </TabsList>

            {/* Inline Iframe */}
            <TabsContent value="iframe" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="width">Width</Label>
                  <Input
                    id="width"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    placeholder="100% or 600px"
                  />
                </div>
                <div>
                  <Label htmlFor="height">Height (px)</Label>
                  <Input
                    id="height"
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    min="400"
                  />
                </div>
              </div>

              <div>
                <Label>Embed Code</Label>
                <div className="relative mt-2">
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
                    <code>{iframeCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    onClick={() => copyToClipboard(iframeCode, 'iframe')}
                  >
                    {copied === 'iframe' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Best for:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Dedicated booking page on your website</li>
                  <li>Embedding in blog posts or landing pages</li>
                  <li>Full scheduling experience without leaving your site</li>
                </ul>
              </div>
            </TabsContent>

            {/* Popup Window */}
            <TabsContent value="popup" className="space-y-4">
              <div>
                <Label>Popup Button Code</Label>
                <div className="relative mt-2">
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
                    <code>{popupCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    onClick={() => copyToClipboard(popupCode, 'popup')}
                  >
                    {copied === 'popup' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Best for:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Opening booking in a new window</li>
                  <li>Call-to-action buttons</li>
                  <li>Not taking up space on your page</li>
                </ul>
              </div>
            </TabsContent>

            {/* Simple Link */}
            <TabsContent value="link" className="space-y-4">
              <div>
                <Label>Link Code</Label>
                <div className="relative mt-2">
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
                    <code>{linkCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    onClick={() => copyToClipboard(linkCode, 'link')}
                  >
                    {copied === 'link' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label>Direct URL</Label>
                <div className="flex gap-2 mt-2">
                  <Input value={bookingUrl} readOnly />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(bookingUrl, 'url')}
                  >
                    {copied === 'url' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Best for:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Email signatures</li>
                  <li>Social media profiles</li>
                  <li>Simple text links</li>
                </ul>
              </div>
            </TabsContent>

            {/* React Component */}
            <TabsContent value="react" className="space-y-4">
              <div>
                <Label>React Modal Component</Label>
                <div className="relative mt-2">
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm max-h-80 overflow-y-auto">
                    <code>{reactCode}</code>
                  </pre>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 text-gray-400 hover:text-white"
                    onClick={() => copyToClipboard(reactCode, 'react')}
                  >
                    {copied === 'react' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                <p className="font-medium mb-1">Best for:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>React/Next.js applications</li>
                  <li>Modal booking experience</li>
                  <li>Custom integration with your app</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
