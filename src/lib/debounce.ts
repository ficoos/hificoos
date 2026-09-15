// eslint-disable-next-line
export const debounce = <T extends (...args: any) => void>(cb: T, delay: number) => {
	let timer: NodeJS.Timeout;
	return (...callbackArgs: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => cb(...callbackArgs), delay);
	};
};
