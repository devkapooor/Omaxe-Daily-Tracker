import { useEffect } from 'react'
import { motion, stagger, useAnimate, useInView } from 'framer-motion'
import { cn } from '@/shared/lib/utils'

type TypewriterWord = {
  text: string
  className?: string
}

type TypewriterEffectProps = {
  words: TypewriterWord[]
  className?: string
  cursorClassName?: string
}

export function TypewriterEffect({ words, className, cursorClassName }: TypewriterEffectProps) {
  const wordsArray = words.map((word) => ({
    ...word,
    text: word.text.split(''),
  }))

  const [scope, animate] = useAnimate()
  const isInView = useInView(scope, { once: true })

  useEffect(() => {
    if (!isInView) return

    void animate(
      'span[data-type-char]',
      { display: 'inline-block', opacity: 1, width: 'fit-content' },
      { duration: 0.3, delay: stagger(0.08), ease: 'easeInOut' },
    )
  }, [animate, isInView])

  return (
    <div className={cn('flex items-end gap-2 text-center font-bold tracking-tight', className)}>
      <motion.div ref={scope} className="inline">
        {wordsArray.map((word, idx) => (
          <div key={`word-${idx}`} className="inline-block">
            {word.text.map((char, index) => (
              <motion.span
                initial={{}}
                key={`char-${index}`}
                data-type-char
                className={cn('hidden text-black opacity-0 dark:text-white', word.className)}
              >
                {char}
              </motion.span>
            ))}
            <span aria-hidden="true"> </span>
          </div>
        ))}
      </motion.div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
        className={cn('inline-block h-5 w-1 rounded-full bg-blue-500 md:h-8 lg:h-12', cursorClassName)}
      />
    </div>
  )
}

export function TypewriterEffectSmooth({ words, className, cursorClassName }: TypewriterEffectProps) {
  return (
    <div className={cn('my-6 flex items-end gap-2', className)}>
      <motion.div
        className="overflow-hidden pb-2"
        initial={{ width: '0%' }}
        whileInView={{ width: 'fit-content' }}
        viewport={{ once: true }}
        transition={{ duration: 2, ease: 'linear', delay: 0.6 }}
      >
        <div className="whitespace-nowrap text-xs font-bold sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
          {words.map((word, idx) => (
            <div key={`smooth-word-${idx}`} className="inline-block">
              {word.text.split('').map((char, index) => (
                <span key={`smooth-char-${index}`} className={cn('text-black dark:text-white', word.className)}>
                  {char}
                </span>
              ))}
              <span aria-hidden="true"> </span>
            </div>
          ))}
        </div>
      </motion.div>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
        className={cn('block h-4 w-1 rounded-full bg-blue-500 sm:h-6 xl:h-12', cursorClassName)}
      />
    </div>
  )
}

