import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	safelist: [
		// DrinkCard accent colors (used dynamically by pickAccent)
		{ pattern: /bg-(violet|sky|amber|yellow|red|green|stone)-(300|400|500|600|700)/ },
		{ pattern: /text-(violet|sky|amber|yellow|red|green|stone)-(300|400|500|600|700)/ },
		'bg-white/18', 'bg-white/10', 'bg-white/15', 'bg-black/12', 'bg-black/14', 'bg-black/20',
		'bg-black/45', 'bg-black/55', 'bg-black/70', 'bg-black/85',
		'text-white', 'text-black', 'text-stone-800',
		'shadow-[0_18px_60px_rgba(124,58,237,0.25)]',
		'shadow-[0_18px_60px_rgba(14,165,233,0.22)]',
		'shadow-[0_18px_60px_rgba(251,191,36,0.22)]',
		'shadow-[0_18px_60px_rgba(250,204,21,0.18)]',
		'shadow-[0_18px_60px_rgba(220,38,38,0.22)]',
		'shadow-[0_18px_60px_rgba(22,163,74,0.22)]',
		'shadow-[0_18px_60px_rgba(68,64,60,0.22)]',
		'shadow-[0_18px_60px_rgba(217,195,160,0.20)]',
		'shadow-[0_0_0_1px_hsl(var(--sidebar-border))]',
		'shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]',
		// Cream palette (pickAccent)
		'bg-gradient-to-br', 'from-amber-50', 'to-amber-100', 'bg-amber-300', 'bg-stone-800/15',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			height: {
				'dvh': '100dvh',
				'svh': '100svh',
			},
			maxHeight: {
				'dvh': '100dvh',
				'svh': '100svh',
			},
			minHeight: {
				'dvh': '100dvh',
				'svh': '100svh',
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
