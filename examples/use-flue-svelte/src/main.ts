import App from './App.svelte';
import './style.css';
import { mount } from 'svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element.');

mount(App, {
	target,
});
